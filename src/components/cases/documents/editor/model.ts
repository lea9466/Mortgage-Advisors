import { z } from "zod";
import type { DocumentCategory, PageRotation } from "@/lib/validation/document";

/** A case document that pages can be taken from (a PDF or a picture). */
export type EditorSource = { id: string; title: string; category: DocumentCategory; contentType: string; size: number };

/** One page of the new document. `key` tells apart two copies of the same page. */
export type EditorPage = { key: string; documentId: string; page: number; rotation: PageRotation };

/** What is being dragged: a whole document, one page of a document, or a page already in the new document. */
const dragSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("document"), documentId: z.uuid() }),
  z.object({ kind: z.literal("page"), documentId: z.uuid(), page: z.number().int().min(0).max(9999) }),
  z.object({ kind: z.literal("move"), key: z.string().min(1).max(64) }),
]);
export type DragData = z.infer<typeof dragSchema>;

const DRAG_TYPE = "application/x-crm-pages";

export function setDragData(event: React.DragEvent, data: DragData) {
  event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(data));
  event.dataTransfer.effectAllowed = data.kind === "move" ? "move" : "copy";
}

/** Whether a drag carries our pages (and not, say, a file from the desktop). */
export function isOurDrag(event: React.DragEvent): boolean {
  return event.dataTransfer.types.includes(DRAG_TYPE);
}

export function readDragData(event: React.DragEvent): DragData | null {
  try {
    const parsed = dragSchema.safeParse(JSON.parse(event.dataTransfer.getData(DRAG_TYPE)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function turn(rotation: PageRotation, by: 90 | -90): PageRotation {
  return (((rotation + by) % 360) + 360) % 360 as PageRotation;
}

export function newKey(): string {
  return crypto.randomUUID();
}

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit/log";
import { findMembership, getAuthStage } from "@/lib/auth/session";
import { getDocumentFile } from "@/lib/cases/documents";
import { getStorageByName } from "@/lib/storage";
import { StorageNotFoundError } from "@/lib/storage/types";
import { createClient } from "@/lib/supabase/server";
import { extensionFor } from "@/lib/validation/document";

const status = (code: number) => new NextResponse(null, { status: code });

/** Types a browser can show by itself. Office files are always downloaded. */
const VIEWABLE = new Set(["application/pdf", "image/jpeg", "image/png"]);

/**
 * Sends one case document to a signed-in member of its account, from the app's
 * own domain (never a redirect to the file store, which content filters such as
 * NetFree may block). Every view and download is written to the audit log first.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return status(404);
  const download = request.nextUrl.searchParams.get("download") === "1";

  const supabase = await createClient();
  const auth = await getAuthStage(supabase);
  if (auth.stage !== "verified") return status(401);
  const membership = await findMembership(supabase, auth.userId);
  if (!membership) return status(404);

  const document = await getDocumentFile(supabase, membership.organization.id, id.data);
  if (!document) return status(404);

  const logged = await recordAudit(supabase, {
    organizationId: membership.organization.id,
    actorId: auth.userId,
    action: download ? "document.download" : "document.view",
    entityType: "document",
    entityId: document.id,
  });
  if (!logged) return status(503);

  try {
    const body = await getStorageByName(document.files.storage_provider).get(document.files.storage_key);
    const contentType = document.files.content_type;
    const inline = !download && VIEWABLE.has(contentType);
    const fileName = `${document.title}.${extensionFor(contentType)}`;
    return new NextResponse(Buffer.from(body), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(body.length),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof StorageNotFoundError) return status(404);
    console.error("document send failed", error instanceof Error ? error.name : "unknown");
    return status(502);
  }
}

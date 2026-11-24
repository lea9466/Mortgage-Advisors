import { z } from "zod";
import { DOCUMENT_CATEGORIES, type DocumentCategory } from "./document";

export const REQUIREMENT_STATUSES = ["missing", "received", "approved", "needs_fix", "not_needed"] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

export const REQUIREMENT_STATUS_LABELS: Record<RequirementStatus, string> = {
  missing: "חסר",
  received: "התקבל",
  approved: "אושר",
  needs_fix: "נדרש תיקון",
  not_needed: "לא נדרש",
};

export type BaseRequirement = { key: string; title: string; category: DocumentCategory; perBorrower: boolean };

/**
 * The basic list every case starts with. It will be refined with the adviser;
 * each adviser adds items of their own in the settings. Keys never change,
 * since cases remember which items they already have by key.
 */
export const BASE_REQUIREMENTS: readonly BaseRequirement[] = [
  { key: "id-card", title: "צילום תעודת זהות כולל ספח", category: "identity", perBorrower: true },
  { key: "pay-slips", title: "3 תלושי שכר אחרונים", category: "income", perBorrower: true },
  { key: "bank-statements", title: "דפי חשבון בנק ל-3 חודשים אחרונים", category: "bank_statements", perBorrower: true },
  { key: "credit-report", title: "דוח נתוני אשראי", category: "liabilities", perBorrower: true },
  { key: "contract", title: "חוזה רכישה או זיכרון דברים", category: "property", perBorrower: false },
  { key: "land-registry", title: "נסח טאבו או אישור זכויות", category: "property", perBorrower: false },
];

const title = z.string().trim().min(1, "חסר שם למסמך").max(200, "השם ארוך מדי");

/** An item the adviser adds to every case's list (settings). */
export const requirementTemplateSchema = z.object({
  title,
  category: z.enum(DOCUMENT_CATEGORIES),
  perBorrower: z.boolean(),
});

/** An item added to one case only. */
export const caseRequirementSchema = z.object({
  title,
  category: z.enum(DOCUMENT_CATEGORIES),
  clientId: z.uuid().optional(),
});

export const requirementUpdateSchema = z.object({
  status: z.enum(REQUIREMENT_STATUSES),
  documentId: z.uuid().nullable(),
  note: z.string().trim().max(300, "ההערה ארוכה מדי"),
});
export type RequirementUpdate = z.infer<typeof requirementUpdateSchema>;

export type RequirementProgress = { needed: number; approved: number; received: number; percent: number };

/**
 * How far a case's list is: of the items still needed, how many arrived and
 * how many were approved. The percentage counts approved items only.
 */
export function requirementProgress(statuses: readonly RequirementStatus[]): RequirementProgress {
  const needed = statuses.filter((status) => status !== "not_needed");
  const approved = needed.filter((status) => status === "approved").length;
  const received = needed.filter((status) => status === "received").length;
  return { needed: needed.length, approved, received, percent: needed.length === 0 ? 0 : Math.round((approved / needed.length) * 100) };
}

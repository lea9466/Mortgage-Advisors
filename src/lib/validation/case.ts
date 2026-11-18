import { z } from "zod";

export const CASE_STAGES = [
  "first_meeting",
  "collecting_documents",
  "submitted_to_banks",
  "approval_in_principle",
  "negotiating_offers",
  "signatures",
  "execution",
  "cancelled",
] as const;
export type CaseStage = (typeof CASE_STAGES)[number];

export const CASE_STAGE_LABELS: Record<CaseStage, string> = {
  first_meeting: "פגישה ראשונה",
  collecting_documents: "איסוף מסמכים",
  submitted_to_banks: "הוגש לבנקים",
  approval_in_principle: "אישור עקרוני",
  negotiating_offers: "משא ומתן על הצעות",
  signatures: "חתימות",
  execution: "ביצוע",
  cancelled: "בוטל / לא יצא לפועל",
};

/** Stages after which a case is no longer worked on. */
export const CLOSED_STAGES: readonly CaseStage[] = ["execution", "cancelled"];

export const MORTGAGE_PURPOSES = [
  "purchase",
  "refinance",
  "renovation",
  "debt_consolidation",
  "any_purpose",
  "reverse_mortgage",
] as const;
export type MortgagePurpose = (typeof MORTGAGE_PURPOSES)[number];

export const PURPOSE_LABELS: Record<MortgagePurpose, string> = {
  purchase: "רכישת דירה",
  refinance: "מחזור משכנתא",
  renovation: "שיפוץ",
  debt_consolidation: "איחוד הלוואות",
  any_purpose: "הלוואה לכל מטרה",
  reverse_mortgage: "משכנתא הפוכה",
};

export const HANDS = ["first", "second"] as const;
export const HAND_LABELS: Record<(typeof HANDS)[number], string> = { first: "יד ראשונה", second: "יד שנייה" };

export const APARTMENT_CLASSES = ["single", "replacement", "investment"] as const;
export const APARTMENT_CLASS_LABELS: Record<(typeof APARTMENT_CLASSES)[number], string> = {
  single: "דירה יחידה",
  replacement: "דירה חליפית",
  investment: "דירה להשקעה",
};

export const BANKS = [
  "hapoalim",
  "leumi",
  "mizrahi_tefahot",
  "discount",
  "first_international",
  "jerusalem",
  "mercantile",
  "other",
] as const;
export type Bank = (typeof BANKS)[number];

export const BANK_LABELS: Record<Bank, string> = {
  hapoalim: "הפועלים",
  leumi: "לאומי",
  mizrahi_tefahot: "מזרחי טפחות",
  discount: "דיסקונט",
  first_international: "הבינלאומי",
  jerusalem: "ירושלים",
  mercantile: "מרכנתיל",
  other: "אחר",
};

const MAX_AMOUNT = 10_000_000_000;

/** "1,780,000", "₪ 1780000" and "1780000" are all 1780000 shekels. */
const amount = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s,₪]/g, ""))
  .pipe(
    z
      .string()
      .regex(/^\d{1,11}$/, "יש להזין סכום בשקלים, בלי אגורות")
      .transform(Number)
      .pipe(z.number().max(MAX_AMOUNT, "הסכום גדול מדי")),
  );

export const openCaseSchema = z.object({
  clientId: z.uuid(),
  purpose: z.enum(MORTGAGE_PURPOSES, "יש לבחור מטרה"),
});

export const caseDetailsSchema = z.object({
  requestedAmount: amount.optional(),
  propertyValue: amount.optional(),
  contractPrice: amount.optional(),
  equity: amount.optional(),
  hand: z.enum(HANDS).optional(),
  apartmentClass: z.enum(APARTMENT_CLASSES).optional(),
});
export type CaseDetailsInput = z.infer<typeof caseDetailsSchema>;

export const CASE_DETAIL_FIELDS = [
  "requestedAmount",
  "propertyValue",
  "contractPrice",
  "equity",
  "hand",
  "apartmentClass",
] as const;
export type CaseDetailsFormValues = Partial<Record<(typeof CASE_DETAIL_FIELDS)[number], string>>;

export function readCaseDetailsForm(formData: FormData): CaseDetailsFormValues {
  const values: CaseDetailsFormValues = {};
  for (const field of CASE_DETAIL_FIELDS) {
    const raw = formData.get(field);
    if (typeof raw === "string" && raw.trim() !== "") values[field] = raw;
  }
  return values;
}

export const stageSchema = z.enum(CASE_STAGES);

export const insightSchema = z.object({
  body: z.string().trim().min(2, "התובנה קצרה מדי").max(1000, "התובנה ארוכה מדי"),
  bank: z.enum(BANKS).optional(),
});

export const caseListSearchSchema = z.object({
  q: z.string().trim().max(60).optional().catch(undefined),
  stage: z.union([z.literal("active"), z.literal("all"), stageSchema]).catch("active").default("active"),
});

export const insightSearchSchema = z.object({
  q: z.string().trim().max(60).optional().catch(undefined),
  bank: z.enum(BANKS).optional().catch(undefined),
});

/** Kinds the adviser writes. 'system' entries are written by the app only. */
export const LOG_KINDS = ["note", "client_call", "bank_call", "meeting", "action", "important"] as const;
export type LogKind = (typeof LOG_KINDS)[number];
export type AnyLogKind = LogKind | "system";

export const LOG_KIND_LABELS: Record<AnyLogKind, string> = {
  note: "הערה",
  client_call: "שיחה עם לקוח",
  bank_call: "שיחה עם בנק",
  meeting: "פגישה",
  action: "פעולה שבוצעה",
  important: "חשוב להמשך",
  system: "אוטומטי",
};

export const logEntrySchema = z.object({
  kind: z.enum(LOG_KINDS, "יש לבחור סוג"),
  body: z.string().trim().min(1, "מה לרשום?").max(4000, "ארוך מדי"),
});

export const logSearchSchema = z.object({
  logq: z.string().trim().max(60).optional().catch(undefined),
  logfrom: z.iso.date().optional().catch(undefined),
});

/** 2026 and 7 as "2026-007". */
export function formatCaseNumber(year: number, seq: number): string {
  return `${year}-${String(seq).padStart(3, "0")}`;
}

/** "2026-007" (or "2026-7") as year and sequence, for search. */
export function parseCaseNumber(value: string): { year: number; seq: number } | null {
  const match = /^(\d{4})-(\d{1,6})$/.exec(value.trim());
  if (!match?.[1] || !match[2]) return null;
  return { year: Number(match[1]), seq: Number(match[2]) };
}

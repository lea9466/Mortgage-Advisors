import { z } from "zod";
import { amount } from "./case";

export const INCOME_KINDS = ["employee", "self_employed", "kollel", "allowance", "other"] as const;
export type IncomeKind = (typeof INCOME_KINDS)[number];

export const INCOME_KIND_LABELS: Record<IncomeKind, string> = {
  employee: "שכיר",
  self_employed: "עצמאי",
  kollel: "אברך כולל",
  allowance: "קצבה",
  other: "הכנסה אחרת",
};

/** What the title field means for each kind of income, and what the amount is called. */
export const INCOME_FIELD_LABELS: Record<IncomeKind, { title: string; amount: string }> = {
  employee: { title: "שם המעסיק", amount: "שכר חודשי נטו" },
  self_employed: { title: "תחום עיסוק", amount: "הכנסה חודשית" },
  kollel: { title: "שם הכולל", amount: "מלגה חודשית" },
  allowance: { title: "סוג הקצבה", amount: "סכום חודשי" },
  other: { title: "תיאור ההכנסה", amount: "סכום חודשי" },
};

/** Kinds that have a job title and seniority. */
export const INCOME_KINDS_WITH_SENIORITY: readonly IncomeKind[] = ["employee", "self_employed"];

export const LIABILITY_KINDS = ["bank_loan", "car_loan", "gemach", "credit_card", "mortgage", "other"] as const;
export type LiabilityKind = (typeof LIABILITY_KINDS)[number];

export const LIABILITY_KIND_LABELS: Record<LiabilityKind, string> = {
  bank_loan: "הלוואה בנקאית",
  car_loan: "הלוואת רכב",
  gemach: 'גמ"ח',
  credit_card: "כרטיס אשראי",
  mortgage: "משכנתא קיימת",
  other: "אחר",
};

export const ACCOUNT_BANKS = [
  "hapoalim",
  "leumi",
  "mizrahi_tefahot",
  "discount",
  "first_international",
  "jerusalem",
  "mercantile",
  "massad",
  "yahav",
  "postal",
  "one_zero",
  "other",
] as const;
export type AccountBank = (typeof ACCOUNT_BANKS)[number];

export const ACCOUNT_BANK_LABELS: Record<AccountBank, string> = {
  hapoalim: "הפועלים",
  leumi: "לאומי",
  mizrahi_tefahot: "מזרחי טפחות",
  discount: "דיסקונט",
  first_international: "הבינלאומי",
  jerusalem: "ירושלים",
  mercantile: "מרכנתיל",
  massad: "מסד",
  yahav: "יהב",
  postal: "בנק הדואר",
  one_zero: "וואן זירו",
  other: "אחר",
};

const optionalInt = (max: number) =>
  z.coerce.number("יש להזין מספר").int("יש להזין מספר שלם").min(0, "לא יכול להיות שלילי").max(max, "גדול מדי").optional();

export const incomeSchema = z
  .object({
    clientId: z.uuid("יש לבחור לווה"),
    kind: z.enum(INCOME_KINDS, "יש לבחור סוג הכנסה"),
    title: z.string().trim().min(1, "שדה חובה").max(120, "ארוך מדי"),
    jobTitle: z.string().trim().max(80, "ארוך מדי").optional(),
    seniorityYears: optionalInt(60),
    seniorityMonths: optionalInt(11),
    monthlyAmount: amount,
  })
  .transform(({ seniorityYears, seniorityMonths, ...rest }) => {
    const withSeniority = INCOME_KINDS_WITH_SENIORITY.includes(rest.kind);
    const hasSeniority = seniorityYears !== undefined || seniorityMonths !== undefined;
    return {
      ...rest,
      jobTitle: rest.kind === "employee" ? rest.jobTitle : undefined,
      seniorityMonths: withSeniority && hasSeniority ? (seniorityYears ?? 0) * 12 + (seniorityMonths ?? 0) : undefined,
    };
  });
export type IncomeInput = z.infer<typeof incomeSchema>;

export const liabilitySchema = z.object({
  clientId: z.uuid("יש לבחור לווה"),
  kind: z.enum(LIABILITY_KINDS, "יש לבחור סוג התחייבות"),
  lender: z.string().trim().max(80, "ארוך מדי").optional(),
  balance: amount.optional(),
  monthlyPayment: amount,
  remainingMonths: optionalInt(600),
});
export type LiabilityInput = z.infer<typeof liabilitySchema>;

export const bankAccountSchema = z.object({
  clientId: z.uuid("יש לבחור לווה"),
  bank: z.enum(ACCOUNT_BANKS, "יש לבחור בנק"),
  branch: z.string().trim().regex(/^\d{1,4}$/, "מספר סניף: עד 4 ספרות").optional(),
  accountNumber: z
    .string()
    .trim()
    .transform((value) => value.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^\d{2,13}$/, "מספר חשבון: ספרות בלבד"))
    .optional(),
  isJoint: z.boolean(),
});
export type BankAccountInput = z.infer<typeof bankAccountSchema>;

/** Reads a form into plain values: empty inputs become undefined, checkboxes become booleans. */
export function readForm(formData: FormData, textFields: readonly string[], checkboxes: readonly string[] = []) {
  const values: Record<string, string | boolean> = {};
  for (const field of textFields) {
    const raw = formData.get(field);
    if (typeof raw === "string" && raw.trim() !== "") values[field] = raw;
  }
  for (const field of checkboxes) values[field] = formData.get(field) === "on";
  return values;
}

export const INCOME_FIELDS = ["clientId", "kind", "title", "jobTitle", "seniorityYears", "seniorityMonths", "monthlyAmount"] as const;
export const LIABILITY_FIELDS = ["clientId", "kind", "lender", "balance", "monthlyPayment", "remainingMonths"] as const;
export const BANK_ACCOUNT_FIELDS = ["clientId", "bank", "branch", "accountNumber"] as const;

export type FinanceFormValues = Record<string, string | boolean>;

/** 30 months as "2 שנים ו-6 חודשים". */
export function formatSeniority(months: number | null | undefined): string {
  if (months === null || months === undefined) return "";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const yearText = years === 0 ? "" : years === 1 ? "שנה" : years === 2 ? "שנתיים" : `${years} שנים`;
  const monthText = rest === 0 ? "" : rest === 1 ? "חודש" : `${rest} חודשים`;
  // Hebrew writes "ו-6 חודשים" with a hyphen before a digit, "וחודש" without.
  if (yearText && monthText) return `${yearText} ו${/^\d/.test(monthText) ? "-" : ""}${monthText}`;
  return yearText || monthText || "פחות מחודש";
}

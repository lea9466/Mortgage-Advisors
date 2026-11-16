import { z } from "zod";
import { canonicalIsraeliId, isValidIsraeliId } from "./israeliId";

export const MARITAL_STATUSES = ["single", "married", "divorced", "widowed", "separated"] as const;
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];

export const MARITAL_STATUS_LABELS: Record<MaritalStatus, string> = {
  single: "רווק/ה",
  married: "נשוי/אה",
  divorced: "גרוש/ה",
  widowed: "אלמן/ה",
  separated: "פרוד/ה",
};

export const MAX_CHILDREN = 20;

const name = z.string().trim().min(1, "שדה חובה").max(60, "ארוך מדי");
const text = (max: number) => z.string().trim().max(max, "ארוך מדי");
const isoDate = z.iso.date("תאריך לא תקין");
const phone = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s()-]/g, ""))
  .pipe(z.string().regex(/^\+?\d{9,14}$/, "מספר טלפון לא תקין"));

/** Fields of the client form, after empty inputs were turned into undefined. */
export const clientSchema = z
  .object({
    firstName: name,
    lastName: name,
    idNumber: z
      .string()
      .trim()
      .refine(isValidIsraeliId, "מספר תעודת זהות לא תקין")
      .transform(canonicalIsraeliId)
      .optional(),
    idIssueDate: isoDate.optional(),
    idExpiryDate: isoDate.optional(),
    birthDate: isoDate.optional(),
    phone,
    phoneAlt: phone.optional(),
    email: z.email("כתובת אימייל לא תקינה").trim().max(254).optional(),
    maritalStatus: z.enum(MARITAL_STATUSES, "יש לבחור מהרשימה").optional(),
    hasOtherCitizenship: z.boolean(),
    otherCitizenship: text(60).optional(),
    city: text(80).optional(),
    street: text(80).optional(),
    houseNumber: text(10).optional(),
    childrenAges: z
      .array(z.coerce.number("גיל לא תקין").int("גיל לא תקין").min(0, "גיל לא תקין").max(60, "גיל לא תקין"))
      .max(MAX_CHILDREN, "יותר מדי ילדים"),
  })
  .refine((data) => !data.hasOtherCitizenship || data.otherCitizenship, {
    message: "איזו אזרחות?",
    path: ["otherCitizenship"],
  })
  .refine((data) => !data.birthDate || data.birthDate <= new Date().toISOString().slice(0, 10), {
    message: "תאריך הלידה בעתיד",
    path: ["birthDate"],
  })
  .refine((data) => !data.idIssueDate || !data.idExpiryDate || data.idExpiryDate > data.idIssueDate, {
    message: "תאריך הפקיעה צריך להיות אחרי תאריך ההנפקה",
    path: ["idExpiryDate"],
  });

export type ClientInput = z.infer<typeof clientSchema>;

export const CLIENT_TEXT_FIELDS = [
  "firstName",
  "lastName",
  "idNumber",
  "idIssueDate",
  "idExpiryDate",
  "birthDate",
  "phone",
  "phoneAlt",
  "email",
  "maritalStatus",
  "otherCitizenship",
  "city",
  "street",
  "houseNumber",
] as const;

export type ClientTextField = (typeof CLIENT_TEXT_FIELDS)[number];
export type ClientFormValues = Partial<Record<ClientTextField, string>> & {
  hasOtherCitizenship?: boolean;
  childrenAges?: string[];
};

/** Reads the client form. Empty inputs become undefined so optional fields stay optional. */
export function readClientForm(formData: FormData): ClientFormValues {
  const values: ClientFormValues = {};
  for (const field of CLIENT_TEXT_FIELDS) {
    const raw = formData.get(field);
    if (typeof raw === "string" && raw.trim() !== "") values[field] = raw;
  }
  values.hasOtherCitizenship = formData.get("hasOtherCitizenship") === "on";
  values.childrenAges = formData
    .getAll("childAge")
    .filter((value): value is string => typeof value === "string" && value.trim() !== "")
    .slice(0, MAX_CHILDREN + 1);
  return values;
}

export const clientSearchSchema = z.object({
  q: z.string().trim().max(60).optional().catch(undefined),
});

export const clientIdSchema = z.uuid();

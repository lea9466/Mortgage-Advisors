import { describe, expect, it } from "vitest";
import {
  bankAccountSchema,
  formatSeniority,
  incomeSchema,
  liabilitySchema,
  readForm,
  INCOME_FIELDS,
  BANK_ACCOUNT_FIELDS,
} from "@/lib/validation/finance";

const CLIENT = "6f1c2c1e-6a0e-4d6e-9f7c-2b6d2f1a9e11";

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe("income", () => {
  it("turns years and months of seniority into months, for an employee", () => {
    const parsed = incomeSchema.safeParse(
      readForm(
        form([["clientId", CLIENT], ["kind", "employee"], ["title", "מוסדות חינוך"], ["jobTitle", "מלמד"], ["seniorityYears", "6"], ["seniorityMonths", "3"], ["monthlyAmount", "14,200"]]),
        INCOME_FIELDS,
      ),
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.seniorityMonths).toBe(75);
    expect(parsed.data.monthlyAmount).toBe(14200);
    expect(parsed.data.jobTitle).toBe("מלמד");
  });

  it("drops job title and seniority for kinds that do not have them", () => {
    const parsed = incomeSchema.safeParse({
      clientId: CLIENT, kind: "kollel", title: "כולל דוגמה", jobTitle: "x", seniorityYears: "2", monthlyAmount: "3800",
    });
    expect(parsed.success && parsed.data.jobTitle).toBeUndefined();
    expect(parsed.success && parsed.data.seniorityMonths).toBeUndefined();
  });

  it("requires a borrower, a title and an amount", () => {
    const parsed = incomeSchema.safeParse({ kind: "employee" });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const fields = parsed.error.issues.map((issue) => String(issue.path[0]));
    expect(fields).toEqual(expect.arrayContaining(["clientId", "title", "monthlyAmount"]));
  });
});

describe("liability", () => {
  it("needs a monthly payment; balance and months are optional", () => {
    expect(liabilitySchema.safeParse({ clientId: CLIENT, kind: "gemach", monthlyPayment: "800" }).success).toBe(true);
    expect(liabilitySchema.safeParse({ clientId: CLIENT, kind: "gemach" }).success).toBe(false);
    expect(liabilitySchema.safeParse({ clientId: CLIENT, kind: "gemach", monthlyPayment: "800", remainingMonths: "-1" }).success).toBe(false);
  });
});

describe("bank account", () => {
  it("cleans the account number and reads the joint box", () => {
    const parsed = bankAccountSchema.safeParse(
      readForm(form([["clientId", CLIENT], ["bank", "postal"], ["branch", "001"], ["accountNumber", "12-345 678"], ["isJoint", "on"]]), BANK_ACCOUNT_FIELDS, ["isJoint"]),
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.accountNumber).toBe("12345678");
    expect(parsed.data.isJoint).toBe(true);
  });

  it("rejects letters in the account number and an unknown bank", () => {
    expect(bankAccountSchema.safeParse({ clientId: CLIENT, bank: "leumi", accountNumber: "12a45", isJoint: false }).success).toBe(false);
    expect(bankAccountSchema.safeParse({ clientId: CLIENT, bank: "fake", isJoint: false }).success).toBe(false);
  });
});

describe("seniority text", () => {
  it("reads naturally in Hebrew", () => {
    expect(formatSeniority(75)).toBe("6 שנים ו-3 חודשים");
    expect(formatSeniority(24)).toBe("שנתיים");
    expect(formatSeniority(13)).toBe("שנה וחודש");
    expect(formatSeniority(1)).toBe("חודש");
    expect(formatSeniority(0)).toBe("פחות מחודש");
  });
});

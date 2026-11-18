import { describe, expect, it } from "vitest";
import {
  caseDetailsSchema,
  caseListSearchSchema,
  formatCaseNumber,
  insightSchema,
  parseCaseNumber,
  readCaseDetailsForm,
} from "@/lib/validation/case";

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe("case details", () => {
  it("reads amounts with commas and a shekel sign as whole shekels", () => {
    const parsed = caseDetailsSchema.safeParse(
      readCaseDetailsForm(form([["contractPrice", "₪1,780,000"], ["equity", " 630000 "], ["requestedAmount", ""]])),
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.contractPrice).toBe(1780000);
    expect(parsed.data.equity).toBe(630000);
    expect(parsed.data.requestedAmount).toBeUndefined();
  });

  it("rejects agorot, negative numbers and text", () => {
    for (const bad of ["1780000.50", "-5", "abc", "<script>"]) {
      expect(caseDetailsSchema.safeParse({ contractPrice: bad }).success).toBe(false);
    }
  });

  it("accepts only known choices for hand and apartment class", () => {
    expect(caseDetailsSchema.safeParse({ hand: "second", apartmentClass: "single" }).success).toBe(true);
    expect(caseDetailsSchema.safeParse({ hand: "third" }).success).toBe(false);
  });
});

describe("case numbers", () => {
  it("formats and parses year-sequence numbers", () => {
    expect(formatCaseNumber(2026, 7)).toBe("2026-007");
    expect(parseCaseNumber("2026-007")).toEqual({ year: 2026, seq: 7 });
    expect(parseCaseNumber("2026-7")).toEqual({ year: 2026, seq: 7 });
    expect(parseCaseNumber("שטרן")).toBeNull();
  });
});

describe("case list filter", () => {
  it("defaults to active cases and ignores unknown stages", () => {
    expect(caseListSearchSchema.parse({}).stage).toBe("active");
    expect(caseListSearchSchema.parse({ stage: "signatures" }).stage).toBe("signatures");
    expect(caseListSearchSchema.parse({ stage: "hacked" }).stage).toBe("active");
  });
});

describe("insights", () => {
  it("needs some text and a known bank", () => {
    expect(insightSchema.safeParse({ body: "טפחות מאשרים הכנסה חדשה עם ותק של חודש", bank: "mizrahi_tefahot" }).success).toBe(true);
    expect(insightSchema.safeParse({ body: " " }).success).toBe(false);
    expect(insightSchema.safeParse({ body: "תקין", bank: "unknown" }).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  caseDetailsSchema,
  caseListSearchSchema,
  formatCaseNumber,
  insightSchema,
  logEntrySchema,
  parseCaseNumber,
  readCaseDetailsForm,
} from "@/lib/validation/case";
import { formatLogTime } from "@/lib/format";

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

describe("case log", () => {
  it("accepts the adviser's kinds but never 'system', which only the app writes", () => {
    expect(logEntrySchema.safeParse({ kind: "bank_call", body: "מזרחי ביקשו אישור על המלגה" }).success).toBe(true);
    expect(logEntrySchema.safeParse({ kind: "system", body: "זיוף" }).success).toBe(false);
    expect(logEntrySchema.safeParse({ kind: "note", body: "   " }).success).toBe(false);
  });

  it("shows today and yesterday by name, in Israel time", () => {
    const now = new Date("2026-11-19T10:00:00Z");
    expect(formatLogTime("2026-11-19T09:40:00Z", now)).toBe("היום 11:40");
    expect(formatLogTime("2026-11-18T17:05:00Z", now)).toBe("אתמול 19:05");
    expect(formatLogTime("2026-11-10T18:00:00Z", now)).toBe("10.11.2026 · 20:00");
  });
});

describe("insights", () => {
  it("needs some text and a known bank", () => {
    expect(insightSchema.safeParse({ body: "טפחות מאשרים הכנסה חדשה עם ותק של חודש", bank: "mizrahi_tefahot" }).success).toBe(true);
    expect(insightSchema.safeParse({ body: " " }).success).toBe(false);
    expect(insightSchema.safeParse({ body: "תקין", bank: "unknown" }).success).toBe(false);
  });
});

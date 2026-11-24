import { describe, expect, it } from "vitest";
import { BASE_REQUIREMENTS, requirementProgress, requirementTemplateSchema, requirementUpdateSchema } from "@/lib/validation/requirement";

describe("document tracking", () => {
  it("counts approved items out of those still needed", () => {
    const progress = requirementProgress(["approved", "approved", "received", "missing", "needs_fix", "not_needed"]);
    expect(progress).toEqual({ needed: 5, approved: 2, received: 1, percent: 40 });
  });

  it("shows zero, not an error, for an empty list", () => {
    expect(requirementProgress([]).percent).toBe(0);
    expect(requirementProgress(["not_needed"]).percent).toBe(0);
  });

  it("keeps the basic list's keys unique, since cases remember items by key", () => {
    const keys = BASE_REQUIREMENTS.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("refuses an empty name, an unknown status and a long note", () => {
    expect(requirementTemplateSchema.safeParse({ title: "  ", category: "other", perBorrower: true }).success).toBe(false);
    expect(requirementUpdateSchema.safeParse({ status: "done", documentId: null, note: "" }).success).toBe(false);
    expect(requirementUpdateSchema.safeParse({ status: "approved", documentId: null, note: "x".repeat(301) }).success).toBe(false);
    expect(requirementUpdateSchema.safeParse({ status: "approved", documentId: null, note: "" }).success).toBe(true);
  });
});

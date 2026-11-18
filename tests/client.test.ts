import { describe, expect, it } from "vitest";
import { clientSchema, readClientForm } from "@/lib/validation/client";
import { canonicalIsraeliId, isValidIsraeliId } from "@/lib/validation/israeliId";
import { ageFromBirthDate, formatPhone } from "@/lib/format";

describe("Israeli ID number", () => {
  it("accepts numbers with a correct check digit", () => {
    expect(isValidIsraeliId("123456782")).toBe(true);
    expect(isValidIsraeliId("000000018")).toBe(true);
    expect(isValidIsraeliId("18")).toBe(false); // too short
    expect(isValidIsraeliId("00018")).toBe(true);
  });

  it("rejects a wrong check digit and non-digits", () => {
    expect(isValidIsraeliId("123456789")).toBe(false);
    expect(isValidIsraeliId("12345678a")).toBe(false);
    expect(isValidIsraeliId("1234567890")).toBe(false);
  });

  it("ignores spaces and dashes and pads to nine digits", () => {
    expect(isValidIsraeliId("12345678-2")).toBe(true);
    expect(canonicalIsraeliId("00018")).toBe("000000018");
    expect(canonicalIsraeliId(" 12345678-2 ")).toBe("123456782");
  });
});

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe("client form", () => {
  const base: [string, string][] = [
    ["firstName", "יעקב"],
    ["lastName", "שטרן"],
    ["phone", "052-000-1111"],
  ];

  it("accepts the minimum and turns empty inputs into missing values", () => {
    const parsed = clientSchema.safeParse(readClientForm(form([...base, ["email", "  "], ["idNumber", ""]])));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.phone).toBe("0520001111");
    expect(parsed.data.email).toBeUndefined();
    expect(parsed.data.idNumber).toBeUndefined();
    expect(parsed.data.childrenAges).toEqual([]);
  });

  it("reads the receives-SMS box, off unless ticked", () => {
    const off = clientSchema.safeParse(readClientForm(form(base)));
    const on = clientSchema.safeParse(readClientForm(form([...base, ["phoneReceivesSms", "on"]])));
    expect(off.success && off.data.phoneReceivesSms).toBe(false);
    expect(on.success && on.data.phoneReceivesSms).toBe(true);
  });

  it("stores the ID number in canonical form", () => {
    const parsed = clientSchema.safeParse(readClientForm(form([...base, ["idNumber", "00018"]])));
    expect(parsed.success && parsed.data.idNumber).toBe("000000018");
  });

  it("reports a bad ID number, a missing name and a bad child age on their fields", () => {
    const parsed = clientSchema.safeParse(
      readClientForm(form([["lastName", "שטרן"], ["phone", "0520001111"], ["idNumber", "123456789"], ["childAge", "-3"]])),
    );
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const paths = parsed.error.issues.map((issue) => String(issue.path[0]));
    expect(paths).toEqual(expect.arrayContaining(["firstName", "idNumber", "childrenAges"]));
  });

  it("requires the other citizenship when the box is ticked", () => {
    const parsed = clientSchema.safeParse(readClientForm(form([...base, ["hasOtherCitizenship", "on"]])));
    expect(parsed.success).toBe(false);
  });

  it("rejects an expiry date before the issue date", () => {
    const parsed = clientSchema.safeParse(
      readClientForm(form([...base, ["idIssueDate", "2020-01-01"], ["idExpiryDate", "2019-01-01"]])),
    );
    expect(parsed.success).toBe(false);
  });

  it("does not let script text through as a phone number", () => {
    const parsed = clientSchema.safeParse(readClientForm(form([...base.slice(0, 2), ["phone", "<script>alert(1)</script>"]])));
    expect(parsed.success).toBe(false);
  });
});

describe("formatting", () => {
  it("computes age from a birth date", () => {
    const now = new Date(2026, 10, 16);
    expect(ageFromBirthDate("1992-05-14", now)).toBe(34);
    expect(ageFromBirthDate("1992-12-01", now)).toBe(33);
    expect(ageFromBirthDate(null, now)).toBeNull();
  });

  it("formats Israeli phone numbers", () => {
    expect(formatPhone("0520001111")).toBe("052-000-1111");
    expect(formatPhone("021234567")).toBe("02-1234567");
    expect(formatPhone("+972520001111")).toBe("+972520001111");
  });
});

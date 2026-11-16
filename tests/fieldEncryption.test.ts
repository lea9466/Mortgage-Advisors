import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { blindIndex, decryptField, encryptField } from "@/lib/crypto/fieldEncryption";

const KEY = randomBytes(32).toString("base64");
const OTHER_KEY = randomBytes(32).toString("base64");

describe("field encryption", () => {
  it("round-trips a value", () => {
    const encrypted = encryptField("123456782", KEY);
    expect(encrypted).not.toContain("123456782");
    expect(decryptField(encrypted, KEY)).toBe("123456782");
  });

  it("produces a different ciphertext every time", () => {
    expect(encryptField("123456782", KEY)).not.toBe(encryptField("123456782", KEY));
  });

  it("fails with the wrong key", () => {
    expect(() => decryptField(encryptField("123456782", KEY), OTHER_KEY)).toThrow();
  });

  it("detects tampering", () => {
    const parts = encryptField("123456782", KEY).split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptField(parts.join("."), KEY)).toThrow();
  });

  it("rejects a key of the wrong length", () => {
    expect(() => encryptField("x", Buffer.from("short").toString("base64"))).toThrow();
  });
});

describe("blind index", () => {
  it("is stable for the same value and ignores spaces", () => {
    expect(blindIndex("123456782", "org:id_number", KEY)).toBe(
      blindIndex(" 12345 6782 ", "org:id_number", KEY),
    );
  });

  it("differs by value, scope and key", () => {
    const base = blindIndex("123456782", "orgA:id_number", KEY);
    expect(blindIndex("123456783", "orgA:id_number", KEY)).not.toBe(base);
    expect(blindIndex("123456782", "orgB:id_number", KEY)).not.toBe(base);
    expect(blindIndex("123456782", "orgA:id_number", OTHER_KEY)).not.toBe(base);
  });
});

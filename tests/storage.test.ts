import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertValidKey,
  attachmentDisposition,
  buildStorageKey,
  keyBelongsToOrganization,
} from "@/lib/storage/keys";
import { LocalStorageProvider } from "@/lib/storage/local";
import { StorageConflictError, StorageNotFoundError } from "@/lib/storage/types";
import { MAX_FILE_BYTES, validateFile } from "@/lib/storage/validateFile";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const SIGNING_KEY = "test-signing-key-that-is-long-enough-123";
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

describe("storage keys", () => {
  it("builds keys scoped to the organization and year", () => {
    const key = buildStorageKey(ORG_A, new Date("2026-03-01T00:00:00Z"));
    expect(key.startsWith(`org/${ORG_A}/2026/`)).toBe(true);
    expect(() => assertValidKey(key)).not.toThrow();
  });

  it("never repeats a key", () => {
    expect(buildStorageKey(ORG_A)).not.toBe(buildStorageKey(ORG_A));
  });

  it("rejects an invalid organization id", () => {
    expect(() => buildStorageKey("not-a-uuid")).toThrow();
  });

  it.each(["../etc/passwd", `org/${ORG_A}/2026/../../x`, `org/${ORG_A}/2026/file.pdf`, "", "/abs"])(
    "rejects unsafe key %j",
    (key) => {
      expect(() => assertValidKey(key)).toThrow();
    },
  );

  it("tells organizations apart", () => {
    const key = buildStorageKey(ORG_A);
    expect(keyBelongsToOrganization(key, ORG_A)).toBe(true);
    expect(keyBelongsToOrganization(key, ORG_B)).toBe(false);
  });

  it("encodes Hebrew download names", () => {
    expect(attachmentDisposition("תלוש שכר.pdf")).toMatch(/^attachment; filename\*=UTF-8''%D7/);
  });
});

describe("LocalStorageProvider (the contract every provider follows)", () => {
  let rootDir = "";
  let storage: LocalStorageProvider;

  beforeAll(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "crm-storage-"));
    storage = new LocalStorageProvider({ rootDir, signingKey: SIGNING_KEY });
  });

  afterAll(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("stores and reads back the same bytes", async () => {
    const key = buildStorageKey(ORG_A);
    await storage.put(key, PDF, { contentType: "application/pdf" });
    expect(await storage.exists(key)).toBe(true);
    expect(Array.from(await storage.get(key))).toEqual(Array.from(PDF));
  });

  it("refuses to overwrite an existing object", async () => {
    const key = buildStorageKey(ORG_A);
    await storage.put(key, PDF, { contentType: "application/pdf" });
    await expect(storage.put(key, PDF, { contentType: "application/pdf" })).rejects.toBeInstanceOf(
      StorageConflictError,
    );
  });

  it("reports a missing object", async () => {
    const key = buildStorageKey(ORG_A);
    expect(await storage.exists(key)).toBe(false);
    await expect(storage.get(key)).rejects.toBeInstanceOf(StorageNotFoundError);
  });

  it("copies without touching the original", async () => {
    const from = buildStorageKey(ORG_A);
    const to = buildStorageKey(ORG_A);
    await storage.put(from, PDF, { contentType: "application/pdf" });
    await storage.copy(from, to);
    expect(Array.from(await storage.get(to))).toEqual(Array.from(PDF));
    expect(await storage.exists(from)).toBe(true);
  });

  it("deletes, and deleting twice is not an error", async () => {
    const key = buildStorageKey(ORG_A);
    await storage.put(key, PDF, { contentType: "application/pdf" });
    await storage.delete(key);
    await storage.delete(key);
    expect(await storage.exists(key)).toBe(false);
  });

  it("rejects path traversal on every operation", async () => {
    await expect(storage.get("../secret")).rejects.toThrow();
    await expect(storage.put("../secret", PDF, { contentType: "application/pdf" })).rejects.toThrow();
  });

  it("signs download links and rejects tampered or expired ones", async () => {
    const key = buildStorageKey(ORG_A);
    const url = new URL(
      await storage.getSignedDownloadUrl(key, { expiresInSeconds: 60, downloadName: "a.pdf" }),
      "http://localhost",
    );
    const link = {
      key,
      expires: Number(url.searchParams.get("expires")),
      name: url.searchParams.get("name") ?? "",
      signature: url.searchParams.get("signature") ?? "",
    };
    expect(storage.verifySignedDownload(link)).toBe(true);
    expect(storage.verifySignedDownload({ ...link, key: buildStorageKey(ORG_B) })).toBe(false);
    expect(storage.verifySignedDownload({ ...link, expires: link.expires + 600 })).toBe(false);
    expect(storage.verifySignedDownload({ ...link, signature: "00" })).toBe(false);

    const expired = new URL(
      await storage.getSignedDownloadUrl(key, { expiresInSeconds: -5 }),
      "http://localhost",
    );
    expect(
      storage.verifySignedDownload({
        key,
        expires: Number(expired.searchParams.get("expires")),
        name: "",
        signature: expired.searchParams.get("signature") ?? "",
      }),
    ).toBe(false);
  });
});

describe("validateFile", () => {
  it("accepts a PDF declared as a PDF", () => {
    expect(validateFile(PDF, "application/pdf")).toEqual({
      ok: true,
      kind: "pdf",
      contentType: "application/pdf",
    });
  });

  it("rejects a file whose content does not match its declared type", () => {
    expect(validateFile(PDF, "image/png")).toEqual({ ok: false, reason: "type-mismatch" });
  });

  it("rejects types that are not on the allowlist", () => {
    const html = new TextEncoder().encode("<script>alert(1)</script>");
    expect(validateFile(html, "text/html")).toEqual({ ok: false, reason: "type-not-allowed" });
    const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>");
    expect(validateFile(svg, "image/svg+xml")).toEqual({ ok: false, reason: "type-not-allowed" });
  });

  it("rejects empty and oversized files", () => {
    expect(validateFile(new Uint8Array(), "application/pdf")).toEqual({ ok: false, reason: "empty" });
    const big = new Uint8Array(MAX_FILE_BYTES + 1);
    big.set(PDF);
    expect(validateFile(big, "application/pdf")).toEqual({ ok: false, reason: "too-large" });
  });
});

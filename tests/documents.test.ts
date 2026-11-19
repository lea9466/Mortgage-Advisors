import { randomBytes, randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

const ORG = randomUUID();
const OTHER_ORG = randomUUID();
const CASE = randomUUID();

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key-0123456789";
  process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

async function load() {
  return import("@/lib/cases/documents");
}

function intent(overrides: Record<string, unknown> = {}) {
  return {
    v: 1 as const,
    org: ORG,
    caseId: CASE,
    key: `org/${ORG}/2026/${randomUUID()}`,
    provider: "supabase" as const,
    contentType: "application/pdf",
    fileName: "חוזה.pdf",
    exp: Math.floor(Date.now() / 1000) + 600,
    ...overrides,
  };
}

describe("upload token", () => {
  it("reads back a token this server signed", async () => {
    const { readIntent, signIntent } = await load();
    const original = intent();
    expect(readIntent(signIntent(original), ORG, CASE).key).toBe(original.key);
  });

  it("refuses a token that was changed after signing", async () => {
    const { readIntent, signIntent, UploadRejectedError } = await load();
    const [payload, signature] = signIntent(intent()).split(".");
    const changed = JSON.parse(Buffer.from(payload ?? "", "base64url").toString("utf8"));
    changed.contentType = "image/png";
    const forged = `${Buffer.from(JSON.stringify(changed)).toString("base64url")}.${signature}`;
    expect(() => readIntent(forged, ORG, CASE)).toThrow(UploadRejectedError);
  });

  it("refuses a token for another account or another case", async () => {
    const { readIntent, signIntent } = await load();
    const token = signIntent(intent());
    expect(() => readIntent(token, OTHER_ORG, CASE)).toThrow();
    expect(() => readIntent(token, ORG, randomUUID())).toThrow();
  });

  it("refuses a key outside the account, even when signed", async () => {
    const { readIntent, signIntent } = await load();
    expect(() => readIntent(signIntent(intent({ key: `org/${OTHER_ORG}/2026/${randomUUID()}` })), ORG, CASE)).toThrow();
  });

  it("refuses an expired token", async () => {
    const { readIntent, signIntent } = await load();
    const token = signIntent(intent({ exp: Math.floor(Date.now() / 1000) - 1 }));
    expect(() => readIntent(token, ORG, CASE)).toThrow(/expired/);
  });

  it("refuses rubbish", async () => {
    const { readIntent } = await load();
    expect(() => readIntent("not-a-token", ORG, CASE)).toThrow();
    expect(() => readIntent("a.b", ORG, CASE)).toThrow();
  });
});

describe("local upload link", () => {
  it("accepts its own signature and rejects a different file type or key", async () => {
    const { LocalStorageProvider } = await import("@/lib/storage/local");
    const storage = new LocalStorageProvider({ rootDir: ".storage-test", signingKey: "x".repeat(40) });
    const key = `org/${ORG}/2026/${randomUUID()}`;
    const { url } = await storage.getSignedUploadUrl(key, { contentType: "application/pdf", expiresInSeconds: 60 });
    const params = new URL(url, "http://localhost").searchParams;
    const input = { key, expires: Number(params.get("expires")), contentType: "application/pdf", signature: params.get("signature") ?? "" };
    expect(storage.verifySignedUpload(input)).toBe(true);
    expect(storage.verifySignedUpload({ ...input, contentType: "image/png" })).toBe(false);
    expect(storage.verifySignedUpload({ ...input, key: `org/${ORG}/2026/${randomUUID()}` })).toBe(false);
  });
});

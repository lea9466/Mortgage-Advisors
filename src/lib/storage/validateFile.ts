export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export type AllowedFileKind = "pdf" | "jpeg" | "png" | "office-xml" | "office-legacy";

export type FileValidationResult =
  | { ok: true; kind: AllowedFileKind; contentType: string }
  | { ok: false; reason: "empty" | "too-large" | "type-not-allowed" | "type-mismatch" };

type Signature = { kind: AllowedFileKind; bytes: readonly number[]; contentTypes: readonly string[] };

/** Allowlist. The real type is decided by the file's first bytes, not by its name. */
const SIGNATURES: readonly Signature[] = [
  { kind: "pdf", bytes: [0x25, 0x50, 0x44, 0x46, 0x2d], contentTypes: ["application/pdf"] },
  { kind: "jpeg", bytes: [0xff, 0xd8, 0xff], contentTypes: ["image/jpeg"] },
  {
    kind: "png",
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    contentTypes: ["image/png"],
  },
  {
    kind: "office-xml",
    bytes: [0x50, 0x4b, 0x03, 0x04],
    contentTypes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
  },
  {
    kind: "office-legacy",
    bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
    contentTypes: ["application/msword", "application/vnd.ms-excel"],
  },
];

function startsWith(body: Uint8Array, bytes: readonly number[]): boolean {
  if (body.length < bytes.length) return false;
  return bytes.every((byte, index) => body[index] === byte);
}

/**
 * Checks an uploaded file before it is stored: size limit, allowlisted type,
 * and that the declared type matches the actual content.
 */
export function validateFile(body: Uint8Array, declaredContentType: string): FileValidationResult {
  if (body.length === 0) return { ok: false, reason: "empty" };
  if (body.length > MAX_FILE_BYTES) return { ok: false, reason: "too-large" };

  const declared = declaredContentType.trim().toLowerCase();
  const signature = SIGNATURES.find((candidate) => startsWith(body, candidate.bytes));
  if (!signature) return { ok: false, reason: "type-not-allowed" };
  if (!signature.contentTypes.includes(declared)) return { ok: false, reason: "type-mismatch" };

  return { ok: true, kind: signature.kind, contentType: declared };
}

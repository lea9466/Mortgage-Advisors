import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;
const KEY_BYTES = 32;

export class FieldCryptoError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "FieldCryptoError";
  }
}

function decodeKey(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== KEY_BYTES) {
    throw new FieldCryptoError("Encryption key must be 32 bytes, base64 encoded");
  }
  return key;
}

/**
 * Encrypts one sensitive field (ID number, bank account number) with
 * AES-256-GCM before it is written to the database. Output: v1.<iv>.<tag>.<data>
 */
export function encryptField(plaintext: string, base64Key: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", decodeKey(base64Key), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const parts = [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64url"));
  return [VERSION, ...parts].join(".");
}

export function decryptField(ciphertext: string, base64Key: string): string {
  const [version, iv, tag, data] = ciphertext.split(".");
  if (version !== VERSION || iv === undefined || tag === undefined || data === undefined) {
    throw new FieldCryptoError("Unrecognized ciphertext format");
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      decodeKey(base64Key),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(data, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    throw new FieldCryptoError("Decryption failed", { cause: error });
  }
}

/**
 * A keyed, one-way fingerprint of a value, stored next to the encrypted field
 * so an exact-match search (for example by ID number) works without decrypting
 * every row. The scope keeps fingerprints of different fields and different
 * organizations from matching each other.
 */
export function blindIndex(value: string, scope: string, base64Key: string): string {
  const normalized = value.replace(/\s+/g, "");
  return createHmac("sha256", decodeKey(base64Key))
    .update(JSON.stringify([scope, normalized]))
    .digest("base64url");
}

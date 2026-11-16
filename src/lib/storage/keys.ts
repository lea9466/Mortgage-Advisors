import { randomUUID } from "node:crypto";
import { z } from "zod";
import { StorageError } from "./types";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const KEY_PATTERN = new RegExp(`^org/${UUID}/\\d{4}/${UUID}$`);
const organizationIdSchema = z.uuid();

/**
 * Builds a new object key: org/<organization id>/<year>/<random id>.
 * The key never contains a client name, ID number or original file name.
 */
export function buildStorageKey(organizationId: string, now: Date = new Date()): string {
  const parsed = organizationIdSchema.safeParse(organizationId);
  if (!parsed.success) throw new StorageError("Invalid organization id");
  return `org/${parsed.data.toLowerCase()}/${now.getUTCFullYear()}/${randomUUID()}`;
}

/** Rejects anything that is not a key we generated (blocks path traversal). */
export function assertValidKey(key: string): void {
  if (!KEY_PATTERN.test(key)) throw new StorageError("Invalid storage key");
}

/** True when the key belongs to the given organization. */
export function keyBelongsToOrganization(key: string, organizationId: string): boolean {
  return KEY_PATTERN.test(key) && key.startsWith(`org/${organizationId.toLowerCase()}/`);
}

/** Content-Disposition value that is safe for any file name, including Hebrew. */
export function attachmentDisposition(downloadName: string): string {
  return `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`;
}

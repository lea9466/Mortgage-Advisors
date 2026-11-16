import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertValidKey } from "./keys";
import {
  StorageConflictError,
  StorageError,
  StorageNotFoundError,
  type PutOptions,
  type SignedUrlOptions,
  type StorageProvider,
} from "./types";

export const LOCAL_DOWNLOAD_PATH = "/api/files/local";

type LocalStorageConfig = {
  rootDir: string;
  /** Secret used to sign download links. At least 32 characters. */
  signingKey: string;
};

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

/**
 * Stores files on the local disk. For development and automated tests only:
 * it has no redundancy and no encryption at rest.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = "local" as const;
  private readonly rootDir: string;
  private readonly signingKey: string;

  constructor(config: LocalStorageConfig) {
    if (config.signingKey.length < 32) {
      throw new StorageError("FILE_URL_SIGNING_KEY must be at least 32 characters");
    }
    this.rootDir = path.resolve(config.rootDir);
    this.signingKey = config.signingKey;
  }

  private pathFor(key: string): string {
    assertValidKey(key);
    return path.join(this.rootDir, ...key.split("/"));
  }

  async put(key: string, body: Uint8Array, _options: PutOptions): Promise<void> {
    const filePath = this.pathFor(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    try {
      await writeFile(filePath, body, { flag: "wx" });
    } catch (error) {
      if (isNodeError(error, "EEXIST")) throw new StorageConflictError(key);
      throw new StorageError("Local write failed", { cause: error });
    }
  }

  async get(key: string): Promise<Uint8Array> {
    try {
      return new Uint8Array(await readFile(this.pathFor(key)));
    } catch (error) {
      if (isNodeError(error, "ENOENT")) throw new StorageNotFoundError(key);
      throw new StorageError("Local read failed", { cause: error });
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.pathFor(key));
      return true;
    } catch (error) {
      if (isNodeError(error, "ENOENT")) return false;
      throw new StorageError("Local stat failed", { cause: error });
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  async copy(fromKey: string, toKey: string): Promise<void> {
    const from = this.pathFor(fromKey);
    const to = this.pathFor(toKey);
    await mkdir(path.dirname(to), { recursive: true });
    try {
      await copyFile(from, to);
    } catch (error) {
      if (isNodeError(error, "ENOENT")) throw new StorageNotFoundError(fromKey);
      throw new StorageError("Local copy failed", { cause: error });
    }
  }

  async getSignedDownloadUrl(key: string, options: SignedUrlOptions): Promise<string> {
    assertValidKey(key);
    const expires = Math.floor(Date.now() / 1000) + options.expiresInSeconds;
    const params = new URLSearchParams({ key, expires: String(expires) });
    if (options.downloadName) params.set("name", options.downloadName);
    params.set("signature", this.sign(key, expires, options.downloadName ?? ""));
    return `${LOCAL_DOWNLOAD_PATH}?${params.toString()}`;
  }

  /** Checks a link produced by getSignedDownloadUrl. */
  verifySignedDownload(input: {
    key: string;
    expires: number;
    name: string;
    signature: string;
  }): boolean {
    if (input.expires < Math.floor(Date.now() / 1000)) return false;
    const expected = Buffer.from(this.sign(input.key, input.expires, input.name), "hex");
    const actual = Buffer.from(input.signature, "hex");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private sign(key: string, expires: number, name: string): string {
    return createHmac("sha256", this.signingKey)
      .update(JSON.stringify([key, expires, name]))
      .digest("hex");
  }
}

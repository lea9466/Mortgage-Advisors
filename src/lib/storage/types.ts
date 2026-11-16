export const STORAGE_PROVIDER_NAMES = ["supabase", "s3", "local"] as const;
export type StorageProviderName = (typeof STORAGE_PROVIDER_NAMES)[number];

export type PutOptions = {
  contentType: string;
};

export type SignedUrlOptions = {
  /** How long the link works. Keep it short: the link is the only credential. */
  expiresInSeconds: number;
  /** File name the browser should save as. */
  downloadName?: string;
};

/**
 * The single contract every file store implements. Application code talks only
 * to this interface, never to a vendor SDK, so moving to another vendor means
 * adding one class and copying the objects across.
 *
 * Keys are opaque and vendor-neutral (see keys.ts). The database stores the key
 * and the provider name, never a URL.
 */
export interface StorageProvider {
  readonly name: StorageProviderName;
  /** Stores a new object. Fails if the key already exists. */
  put(key: string, body: Uint8Array, options: PutOptions): Promise<void>;
  /** Reads a whole object. Throws StorageNotFoundError when it is missing. */
  get(key: string): Promise<Uint8Array>;
  exists(key: string): Promise<boolean>;
  /** Removes an object. Removing a missing object is not an error. */
  delete(key: string): Promise<void>;
  copy(fromKey: string, toKey: string): Promise<void>;
  /** A temporary download link for the browser. */
  getSignedDownloadUrl(key: string, options: SignedUrlOptions): Promise<string>;
}

export class StorageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "StorageError";
  }
}

export class StorageNotFoundError extends StorageError {
  constructor(key: string) {
    super(`Object not found: ${key}`);
    this.name = "StorageNotFoundError";
  }
}

export class StorageConflictError extends StorageError {
  constructor(key: string) {
    super(`Object already exists: ${key}`);
    this.name = "StorageConflictError";
  }
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertValidKey } from "./keys";
import {
  StorageConflictError,
  StorageError,
  StorageNotFoundError,
  type PutOptions,
  type SignedUrlOptions,
  type StorageProvider,
} from "./types";

type SupabaseStorageConfig = {
  /** A client created with the secret key. The bucket is private and has no policies. */
  client: SupabaseClient;
  bucket: string;
};

type StorageApiError = { message: string; statusCode?: string; status?: number };

function statusOf(error: StorageApiError): number {
  return Number(error.statusCode ?? error.status ?? 0);
}

/** Stores files in a private Supabase Storage bucket. */
export class SupabaseStorageProvider implements StorageProvider {
  readonly name = "supabase" as const;
  private readonly client: SupabaseClient;
  private readonly bucket: string;

  constructor(config: SupabaseStorageConfig) {
    this.client = config.client;
    this.bucket = config.bucket;
  }

  private get files() {
    return this.client.storage.from(this.bucket);
  }

  async put(key: string, body: Uint8Array, options: PutOptions): Promise<void> {
    assertValidKey(key);
    const { error } = await this.files.upload(key, body, {
      contentType: options.contentType,
      upsert: false,
    });
    if (!error) return;
    if (statusOf(error) === 409) throw new StorageConflictError(key);
    throw new StorageError("Supabase upload failed", { cause: error });
  }

  async get(key: string): Promise<Uint8Array> {
    assertValidKey(key);
    const { data, error } = await this.files.download(key);
    if (error) {
      if (statusOf(error) === 404 || statusOf(error) === 400) throw new StorageNotFoundError(key);
      throw new StorageError("Supabase download failed", { cause: error });
    }
    return new Uint8Array(await data.arrayBuffer());
  }

  async exists(key: string): Promise<boolean> {
    assertValidKey(key);
    const { data, error } = await this.files.exists(key);
    if (error) {
      if (statusOf(error) === 404 || statusOf(error) === 400) return false;
      throw new StorageError("Supabase exists check failed", { cause: error });
    }
    return data;
  }

  async delete(key: string): Promise<void> {
    assertValidKey(key);
    const { error } = await this.files.remove([key]);
    if (error) throw new StorageError("Supabase delete failed", { cause: error });
  }

  async copy(fromKey: string, toKey: string): Promise<void> {
    assertValidKey(fromKey);
    assertValidKey(toKey);
    const { error } = await this.files.copy(fromKey, toKey);
    if (!error) return;
    if (statusOf(error) === 404) throw new StorageNotFoundError(fromKey);
    throw new StorageError("Supabase copy failed", { cause: error });
  }

  async getSignedDownloadUrl(key: string, options: SignedUrlOptions): Promise<string> {
    assertValidKey(key);
    const { data, error } = await this.files.createSignedUrl(key, options.expiresInSeconds, {
      download: options.downloadName ?? true,
    });
    if (error) throw new StorageError("Supabase signed URL failed", { cause: error });
    return data.signedUrl;
  }
}

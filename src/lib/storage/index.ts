import "server-only";
import { getEnv, requireEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { LocalStorageProvider } from "./local";
import { S3StorageProvider } from "./s3";
import { SupabaseStorageProvider } from "./supabase";
import type { StorageProvider, StorageProviderName } from "./types";

const instances = new Map<StorageProviderName, StorageProvider>();

function create(name: StorageProviderName): StorageProvider {
  const env = getEnv();
  switch (name) {
    case "supabase":
      return new SupabaseStorageProvider({
        client: createAdminClient(),
        bucket: env.STORAGE_BUCKET,
      });
    case "s3":
      return new S3StorageProvider({
        bucket: env.STORAGE_BUCKET,
        region: env.S3_REGION,
        endpoint: env.S3_ENDPOINT,
        accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
      });
    case "local":
      return new LocalStorageProvider({
        rootDir: env.LOCAL_STORAGE_DIR,
        signingKey: requireEnv("FILE_URL_SIGNING_KEY"),
      });
  }
}

/**
 * The store a file lives in, by the provider name saved on its database row.
 * During a migration between vendors, old files are still read from the old
 * provider this way.
 */
export function getStorageByName(name: StorageProviderName): StorageProvider {
  const existing = instances.get(name);
  if (existing) return existing;
  const created = create(name);
  instances.set(name, created);
  return created;
}

/** The store new files are written to (STORAGE_PROVIDER). */
export function getStorage(): StorageProvider {
  return getStorageByName(getEnv().STORAGE_PROVIDER);
}

export { buildStorageKey, keyBelongsToOrganization } from "./keys";
export { validateFile, MAX_FILE_BYTES } from "./validateFile";
export * from "./types";

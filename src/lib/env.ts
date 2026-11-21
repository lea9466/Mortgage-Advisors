import "server-only";
import { z } from "zod";

const optionalString = z.string().trim().min(1).optional();

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().trim().min(20),
  SUPABASE_SECRET_KEY: optionalString,
  /** Public address of the site, used in the confirmation link of sign-up emails. */
  SITE_URL: z.url().default("http://localhost:3000"),
  STORAGE_PROVIDER: z.enum(["supabase", "s3", "local"]).default("supabase"),
  STORAGE_BUCKET: z.string().trim().min(1).max(63).default("case-files"),
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().trim().min(1).default("auto"),
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  LOCAL_STORAGE_DIR: z.string().trim().min(1).default(".storage"),
  FILE_URL_SIGNING_KEY: optionalString,
  FIELD_ENCRYPTION_KEY: optionalString,
  /** Email through Resend. Without it, development prints emails to the terminal. */
  RESEND_API_KEY: optionalString,
  EMAIL_FROM: z.string().trim().min(3).default("מערכת המשכנתאות <onboarding@resend.dev>"),
  BLIND_INDEX_KEY: optionalString,
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/** Empty strings in .env files mean "not set". */
function withoutEmptyValues(source: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string" && value.trim() !== "") result[key] = value;
  }
  return result;
}

/** Validated server environment. Throws with the names (never the values) of bad variables. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(withoutEmptyValues(process.env));
  if (!parsed.success) {
    const names = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid or missing environment variables: ${names}`);
  }
  cached = parsed.data;
  return cached;
}

/** A variable that is optional in general but required by the feature being used. */
export function requireEnv<K extends keyof Env>(name: K): NonNullable<Env[K]> {
  const value = getEnv()[name];
  if (value === undefined || value === null) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value as NonNullable<Env[K]>;
}

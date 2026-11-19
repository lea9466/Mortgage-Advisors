import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { findMembership, getAuthStage } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { getStorageByName, MAX_FILE_BYTES } from "@/lib/storage";
import { keyBelongsToOrganization } from "@/lib/storage/keys";
import { LocalStorageProvider } from "@/lib/storage/local";
import { StorageConflictError } from "@/lib/storage/types";
import { createClient } from "@/lib/supabase/server";

const querySchema = z.object({
  key: z.string().min(1).max(200),
  expires: z.coerce.number().int().positive(),
  type: z.string().min(1).max(127),
  signature: z.string().regex(/^[0-9a-f]{64}$/),
});

const status = (code: number) => new NextResponse(null, { status: code });

/**
 * Receives one direct upload for the local (development) storage provider, the
 * way a cloud bucket would. In production this route answers 404.
 */
export async function PUT(request: NextRequest) {
  if (getEnv().STORAGE_PROVIDER !== "local") return status(404);

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return status(404);
  const { key, expires, type, signature } = parsed.data;

  const supabase = await createClient();
  const auth = await getAuthStage(supabase);
  if (auth.stage !== "verified") return status(401);
  const membership = await findMembership(supabase, auth.userId);
  if (!membership || !keyBelongsToOrganization(key, membership.organization.id)) return status(404);

  const storage = getStorageByName("local");
  if (!(storage instanceof LocalStorageProvider)) return status(404);
  if (!storage.verifySignedUpload({ key, expires, contentType: type, signature })) return status(403);

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_FILE_BYTES) return status(413);
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.length === 0 || body.length > MAX_FILE_BYTES) return status(413);

  try {
    await storage.put(key, body, { contentType: type });
    return status(200);
  } catch (error) {
    if (error instanceof StorageConflictError) return status(409);
    console.error("local upload failed");
    return status(500);
  }
}

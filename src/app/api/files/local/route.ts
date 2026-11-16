import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { findMembership, getAuthStage } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { getStorageByName } from "@/lib/storage";
import { attachmentDisposition, keyBelongsToOrganization } from "@/lib/storage/keys";
import { LocalStorageProvider } from "@/lib/storage/local";
import { StorageNotFoundError } from "@/lib/storage/types";
import { createClient } from "@/lib/supabase/server";

const querySchema = z.object({
  key: z.string().min(1).max(200),
  expires: z.coerce.number().int().positive(),
  name: z.string().max(255).default(""),
  signature: z.string().regex(/^[0-9a-f]{64}$/),
});

const notFound = () => new NextResponse(null, { status: 404 });

/**
 * Serves files for the local (development) storage provider. In production the
 * cloud provider serves signed links itself and this route answers 404.
 */
export async function GET(request: NextRequest) {
  if (getEnv().STORAGE_PROVIDER !== "local") return notFound();

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return notFound();
  const { key, expires, name, signature } = parsed.data;

  const supabase = await createClient();
  const auth = await getAuthStage(supabase);
  if (auth.stage !== "verified") return new NextResponse(null, { status: 401 });

  const membership = await findMembership(supabase, auth.userId);
  if (!membership || !keyBelongsToOrganization(key, membership.organization.id)) return notFound();

  const storage = getStorageByName("local");
  if (!(storage instanceof LocalStorageProvider)) return notFound();
  if (!storage.verifySignedDownload({ key, expires, name, signature })) return notFound();

  try {
    const body = await storage.get(key);
    return new NextResponse(Buffer.from(body), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": attachmentDisposition(name || "file"),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof StorageNotFoundError) return notFound();
    console.error("local file download failed");
    return new NextResponse(null, { status: 500 });
  }
}

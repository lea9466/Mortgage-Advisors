import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { buildCsp, originOf } from "@/lib/security/csp";

const PUBLIC_PATHS = new Set(["/login", "/signup", "/auth/callback", "/setup"]);
/** Pages that make no sense once signed in. */
const SIGNED_OUT_ONLY = new Set(["/login", "/signup"]);
const CSP_HEADER = "Content-Security-Policy";

/**
 * Runs before every page request:
 * 1. issues a per-request CSP nonce,
 * 2. refreshes the Supabase session cookie,
 * 3. sends signed-out visitors to /login (an early check only; every page and
 *    action re-verifies the session on the server).
 */
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  // Browsers upload documents straight to the file store, so its origin is allowed for connect-src.
  const uploadOrigins =
    process.env.STORAGE_PROVIDER === "s3"
      ? originOf(process.env.S3_ENDPOINT)
      : process.env.STORAGE_PROVIDER === "local"
        ? []
        : originOf(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development", uploadOrigins);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(CSP_HEADER, csp);

  const { pathname } = request.nextUrl;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    if (pathname === "/setup") {
      return finish(NextResponse.next({ request: { headers: requestHeaders } }), csp);
    }
    return finish(NextResponse.redirect(new URL("/setup", request.url)), csp);
  }

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        requestHeaders.set("cookie", request.cookies.toString());
        response = NextResponse.next({ request: { headers: requestHeaders } });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const isSignedIn = data.user !== null;

  if (!isSignedIn && !PUBLIC_PATHS.has(pathname)) {
    return finish(redirectKeepingCookies("/login", request, response), csp);
  }
  if (isSignedIn && SIGNED_OUT_ONLY.has(pathname)) {
    return finish(redirectKeepingCookies("/", request, response), csp);
  }
  return finish(response, csp);
}

function redirectKeepingCookies(path: string, request: NextRequest, from: NextResponse) {
  const redirect = NextResponse.redirect(new URL(path, request.url));
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

function finish(response: NextResponse, csp: string) {
  response.headers.set(CSP_HEADER, csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

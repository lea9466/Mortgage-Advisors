/**
 * Builds the Content-Security-Policy header value for one request.
 * `uploadOrigins` are the file stores the browser may upload to directly
 * (the Supabase or S3 origin), and nothing else.
 */
export function buildCsp(nonce: string, isDev: boolean, uploadOrigins: readonly string[] = []): string {
  const scriptSrc = isDev
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;
  const styleSrc = isDev ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`;
  const connectSrc = ["connect-src 'self'", ...uploadOrigins].join(" ");

  const directives = [
    "default-src 'self'",
    scriptSrc,
    styleSrc,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    connectSrc,
    // The pdf.js worker that draws document pages, bundled with the app.
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (!isDev) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

/** The origin (scheme and host) of a URL, or nothing if it is not a valid https/http URL. */
export function originOf(url: string | undefined): string[] {
  if (!url) return [];
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? [parsed.origin] : [];
  } catch {
    return [];
  }
}

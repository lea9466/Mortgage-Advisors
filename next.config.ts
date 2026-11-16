import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cache-Control", value: "no-store" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Every page is per-user and carries a per-request CSP nonce (see src/proxy.ts),
  // which is incompatible with prerendered shells. All routes render dynamically.
  cacheComponents: false,
  async headers() {
    return [
      { source: "/((?!_next/static|_next/image|favicon.ico).*)", headers: securityHeaders },
    ];
  },
};

export default nextConfig;

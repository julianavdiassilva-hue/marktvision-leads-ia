import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Somente recursos do próprio sistema (+ SDK da Meta usado na conexão oficial do WhatsApp).
  { key: "Content-Security-Policy", value: [
    "default-src 'self'", `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"} https://connect.facebook.net`, "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:", "font-src 'self' data:", "connect-src 'self' https://*.facebook.com https://connect.facebook.net",
    "frame-src https://*.facebook.com", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'",
  ].join("; ") },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["pg", "bcryptjs"],
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default nextConfig;

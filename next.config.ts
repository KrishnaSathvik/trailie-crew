import type { NextConfig } from "next";

import { productionSecurityHeaders } from "./src/server/security-headers";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1"],
  transpilePackages: [
    "@trailie/schemas",
    "@trailie/validation",
    "@trailie/travel-tools",
    "@trailie/trailverse-adapter",
  ],
  async rewrites() {
    return [{ source: "/create", destination: "/trips/create" }];
  },
  async headers() {
    const hostedProductionHeaders =
      process.env.APP_ENV === "production" &&
      process.env.NEXT_PUBLIC_SUPABASE_URL
        ? productionSecurityHeaders(process.env.NEXT_PUBLIC_SUPABASE_URL)
        : [];
    const privateHeaders = [
      { key: "Cache-Control", value: "private, no-store, max-age=0" },
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Content-Type-Options", value: "nosniff" },
    ];
    return [
      ...(hostedProductionHeaders.length > 0
        ? [{ source: "/:path*", headers: hostedProductionHeaders }]
        : []),
      { source: "/share/:path*", headers: privateHeaders },
      {
        source: "/trips/:roomId/plans/:version/print",
        headers: privateHeaders,
      },
    ];
  },
};

export default nextConfig;

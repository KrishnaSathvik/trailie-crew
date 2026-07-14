import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1"],
  transpilePackages: [
    "@trailie/schemas",
    "@trailie/validation",
    "@trailie/travel-tools",
    "@trailie/trailverse-adapter",
  ],
  async headers() {
    const privateHeaders = [
      { key: "Cache-Control", value: "private, no-store, max-age=0" },
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Content-Type-Options", value: "nosniff" },
    ];
    return [
      { source: "/share/:path*", headers: privateHeaders },
      {
        source: "/trips/:roomId/plans/:version/print",
        headers: privateHeaders,
      },
    ];
  },
};

export default nextConfig;

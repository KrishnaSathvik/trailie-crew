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
};

export default nextConfig;

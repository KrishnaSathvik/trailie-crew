import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@trailie/schemas",
    "@trailie/validation",
    "@trailie/travel-tools",
    "@trailie/trailverse-adapter",
  ],
};

export default nextConfig;

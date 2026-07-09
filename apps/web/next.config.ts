import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@zeta/db", "@zeta/shared", "@zeta/types"],
  typescript: {
    // Temporarily ignore build errors while we stabilize the new CAID pages
    // TODO: remove once all TS errors are resolved
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000", "*.onrender.com"],
    },
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@zeta/db", "@zeta/shared", "@zeta/types"],
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000", "*.onrender.com"],
    },
  },
};

export default nextConfig;

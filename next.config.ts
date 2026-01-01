import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Ensure proper module resolution
  transpilePackages: [],
  // Set workspace root to silence lockfile warning
  experimental: {
    turbo: {
      root: process.cwd(),
    },
  },
};

export default nextConfig;

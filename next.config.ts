import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Explicitly set the turbopack root to this project directory
  // This prevents Next.js from looking for dependencies in parent directories
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Explicitly set the turbopack root to this project directory
  // This prevents Next.js from looking for dependencies in parent directories
  turbopack: {
    root: process.cwd(),
  },

  // Configure remote image patterns for Next.js Image component
  images: {
    remotePatterns: [
      // Local Python career automation service (development)
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '8000',
        pathname: '/assets/**',
      },
      // Production career automation service
      {
        protocol: 'https',
        hostname: process.env.CAREER_AUTOMATION_HOST || 'career-automation.railway.app',
        pathname: '/assets/**',
      },
      // Allow any subdomain for flexibility in deployment
      {
        protocol: 'https',
        hostname: '*.railway.app',
        pathname: '/assets/**',
      },
    ],
  },
};

export default nextConfig;

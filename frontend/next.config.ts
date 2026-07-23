import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Was experimental.typedRoutes — promoted to stable top-level in Next 15.5.
  typedRoutes: true,
  images: {
    // Cloudflare R2 + custom delivery domain
    remotePatterns: [
      { protocol: "https", hostname: "**.r2.cloudflarestorage.com" },
      { protocol: "https", hostname: "cdn.headshotdesk.com" },
    ],
  },
};

export default nextConfig;

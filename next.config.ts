import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only: Next blocks dev scripts for non-localhost origins, so phones on the
  // LAN loaded pages that never hydrated (sidebar and menus did nothing).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
  cacheComponents: true,
  experimental: {
    // Largest upload is 4 MB payment proof plus multipart overhead; stays under Vercel's 4.5 MB cap.
    serverActions: { bodySizeLimit: "4.2mb" },
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

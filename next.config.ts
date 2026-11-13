import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only: Next blocks dev scripts for non-localhost origins, so phones on the
  // LAN loaded pages that never hydrated (sidebar and menus did nothing).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
  cacheComponents: true,
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

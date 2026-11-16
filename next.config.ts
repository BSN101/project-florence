import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only: Next blocks dev scripts for non-localhost origins, so phones on the
  // LAN loaded pages that never hydrated (sidebar and menus did nothing).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
  cacheComponents: true,
  experimental: {
    // Largest upload is 4 MB payment proof plus multipart overhead; stays under Vercel's 4.5 MB cap.
    serverActions: { bodySizeLimit: "4.2mb" },
    // Revisiting a page by link within 30 s reuses its last render (Back/Forward always does).
    // Writes refresh it at once through revalidatePath; live screens show a RefreshButton.
    staleTimes: { dynamic: 30 },
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

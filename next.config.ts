import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Every screen is server-rendered per request, so without this, tapping
    // between Pipeline, Forecast and Dashboard re-queries each time. 30s of
    // client-side reuse makes moving around the app feel instant while still
    // showing fresh numbers after any edit (which revalidates explicitly).
    staleTimes: { dynamic: 30, static: 180 },
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;

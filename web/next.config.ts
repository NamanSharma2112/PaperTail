import type { NextConfig } from "next";

const api = process.env.PAPERTRAIL_API_URL ?? "http://127.0.0.1:8000";

const config: NextConfig = {
  // The browser only ever talks to this app; /api is forwarded to the PaperTrail API.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${api}/api/:path*` }];
  },
};

export default config;

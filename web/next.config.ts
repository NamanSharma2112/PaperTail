import type { NextConfig } from "next";

// Where the PaperTrail API lives. Read when the app is built: the Docker image is built
// with http://api:8000, local development uses the default.
const api = process.env.PAPERTRAIL_API_URL ?? "http://127.0.0.1:8000";

const config: NextConfig = {
  // A self-contained server bundle, so the Docker image needs no node_modules.
  output: "standalone",
  // The browser only ever talks to this app; /api is forwarded to the PaperTrail API.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${api}/api/:path*` }];
  },
};

export default config;

import type { NextConfig } from "next";
import path from "path";

const backendOrigin =
  process.env.APOLLO_BACKEND_URL ?? "http://127.0.0.1:8001";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

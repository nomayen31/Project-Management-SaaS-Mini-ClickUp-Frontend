import type { NextConfig } from "next";

const backend = process.env.BACKEND_ORIGIN ?? "http://127.0.0.1:4000";
const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    }, {
      source: "/auth",
      headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
    }];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};
export default config;

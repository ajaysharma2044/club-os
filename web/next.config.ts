import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.CEC_DIST_DIR || ".next",
};

export default nextConfig;


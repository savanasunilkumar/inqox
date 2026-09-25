import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;

if (process.env.NODE_ENV === "development" && process.env.INQOX_PROFILE_PREVIEW !== "1") void initOpenNextCloudflareForDev();

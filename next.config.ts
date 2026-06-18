import type { NextConfig } from "next";
import withSerwist from "@serwist/next";

const nextConfig: NextConfig = {
  turbopack: {},
};

export default withSerwist({
  swSrc: "sw.ts",
  swDest: "public/sw.js",
  maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
  disable: process.env.NODE_ENV === "development",
})(nextConfig);

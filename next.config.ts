import type { NextConfig } from "next";
import { baseURL } from "./baseUrl";

const nextConfig: NextConfig = {
  assetPrefix: baseURL,
  serverExternalPackages: [
    "@solana/kit",
    "@solana-program/system",
    "@solana-program/token",
    "@coinbase/cdp-sdk",
    "axios",
  ],
  turbopack: {
    resolveAlias: {
      "@solana/kit": { browser: "" },
      "@solana-program/system": { browser: "" },
      "@solana-program/token": { browser: "" },
      axios: { browser: "" },
    },
  },
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

export default nextConfig;

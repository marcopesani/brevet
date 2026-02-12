import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

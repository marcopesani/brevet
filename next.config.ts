import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  reactCompiler: true,
  cacheComponents: true,
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

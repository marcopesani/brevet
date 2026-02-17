import type { NextConfig } from "next";

// Use an absolute assetPrefix only when BASE_URL is set (e.g. dev tunnel). Otherwise
// use relative URLs so assets are always same-origin and fonts are not blocked by CORS
// when the same build is served from different Vercel URLs (branch vs preview).
const assetPrefix = process.env.BASE_URL ?? undefined;

const nextConfig: NextConfig = {
  ...(assetPrefix !== undefined && { assetPrefix }),
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

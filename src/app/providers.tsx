"use client";

import { wagmiAdapter, projectId, networks } from "@/lib/walletconnect";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createAppKit } from "@reown/appkit/react";
import { base } from "@reown/appkit/networks";
import React, { type ReactNode } from "react";
import { cookieToInitialState, WagmiProvider, type Config } from "wagmi";
import { SessionProvider } from "next-auth/react";
import { siweConfig } from "@/lib/siwe-config";

const queryClient = new QueryClient();

const metadata = {
  name: "PayMCP",
  description: "AI payment proxy with WalletConnect",
  url: typeof window !== "undefined" ? window.location.origin : "https://paymcp.com",
  icons: [],
};

createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks: [base],
  defaultNetwork: base,
  metadata,
  features: {
    analytics: false,
    email: false,
    socials: [],
  },
  siweConfig,
});

export default function Providers({
  children,
  cookies,
}: {
  children: ReactNode;
  cookies: string | null;
}) {
  const initialState = cookieToInitialState(
    wagmiAdapter.wagmiConfig as Config,
    cookies,
  );

  return (
    <WagmiProvider
      config={wagmiAdapter.wagmiConfig as Config}
      initialState={initialState}
    >
      <QueryClientProvider client={queryClient}>
        <SessionProvider>{children}</SessionProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

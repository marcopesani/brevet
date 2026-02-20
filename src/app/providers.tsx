"use client";

import { wagmiAdapter, projectId, networks } from "@/lib/walletconnect";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createAppKit } from "@reown/appkit/react";
import { OptionsController } from "@reown/appkit-controllers";
import React, { type ReactNode } from "react";
import { cookieToInitialState, WagmiProvider, type Config } from "wagmi";
import { SessionProvider } from "next-auth/react";
import { siweConfig } from "@/lib/siwe-config";
import { ChainProvider } from "@/contexts/chain-context";

const queryClient = new QueryClient();

const metadata = {
  name: "Brevet",
  description: "Payment gateway for AI agents. Connect your wallet. Set spending policies.",
  url: typeof window !== "undefined" ? window.location.origin : "https://brevet.dev",
  icons: [],
};

createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks,
  defaultNetwork: networks[0],
  metadata,
  siweConfig,
  features: {
    analytics: false,
    email: false,
    socials: [],
  },
});

/**
 * Reown Cloud remote features may have `reownAuthentication: true`, which
 * causes AppKit to replace our custom SIWE config with its built-in
 * ReownAuthentication during initialization. Detect the override and
 * re-apply our custom SIWE config so the NextAuth credentials flow is used.
 */
const customSIWX = siweConfig.mapToSIWX();
let siwxGuardApplied = false;
OptionsController.subscribeKey("siwx", (currentSiwx) => {
  if (!siwxGuardApplied && currentSiwx && currentSiwx !== customSIWX) {
    siwxGuardApplied = true;
    OptionsController.setSIWX(customSIWX);
  }
});

export default function Providers({
  children,
  cookies,
  initialChainId,
}: {
  children: ReactNode;
  cookies: string | null;
  initialChainId?: number;
}) {
  const initialState = cookieToInitialState(
    wagmiAdapter.wagmiConfig as Config,
    cookies,
  );

  return (
    <SessionProvider>
      <WagmiProvider
        config={wagmiAdapter.wagmiConfig as Config}
        initialState={initialState}
      >
        <QueryClientProvider client={queryClient}>
          <ChainProvider initialChainId={initialChainId}>
            {children}
          </ChainProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </SessionProvider>
  );
}

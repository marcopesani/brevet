import { cookieStorage, createStorage } from "@wagmi/core";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { base } from "@reown/appkit/networks";

export const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

export const networks = [base];

/**
 * Note: eth_signTypedData_v4 is supported by default through Reown AppKit's
 * WagmiAdapter — Wagmi's useSignTypedData hook uses it automatically.
 * No explicit method configuration is needed.
 */
export const wagmiAdapter = new WagmiAdapter({
  storage: createStorage({
    storage: cookieStorage,
  }),
  ssr: true,
  projectId,
  networks,
});

export const config = wagmiAdapter.wagmiConfig;

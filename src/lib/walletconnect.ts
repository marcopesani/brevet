import { cookieStorage, createStorage } from "@wagmi/core";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import type { AppKitNetwork } from "@reown/appkit-common";
import {
  base,
  baseSepolia,
  arbitrum,
  arbitrumSepolia,
  optimism,
  optimismSepolia,
  polygon,
  polygonAmoy,
} from "@reown/appkit/networks";
import { getDefaultChainConfig } from "@/lib/chain-config";

export const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

const APPKIT_NETWORKS = {
  [base.id]: base,
  [baseSepolia.id]: baseSepolia,
  [arbitrum.id]: arbitrum,
  [arbitrumSepolia.id]: arbitrumSepolia,
  [optimism.id]: optimism,
  [optimismSepolia.id]: optimismSepolia,
  [polygon.id]: polygon,
  [polygonAmoy.id]: polygonAmoy,
} as const;

const defaultChainId = getDefaultChainConfig().chain.id;
const defaultNetwork = APPKIT_NETWORKS[defaultChainId as keyof typeof APPKIT_NETWORKS] ?? base;

// Put the default network first so AppKit uses it as the initial selection
export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [
  defaultNetwork,
  ...Object.values(APPKIT_NETWORKS).filter((n) => n.id !== defaultNetwork.id),
];

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

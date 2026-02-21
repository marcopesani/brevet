import { cookieStorage, createStorage } from "@wagmi/core";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import type { AppKitNetwork } from "@reown/appkit-common";
import {
  mainnet,
  sepolia,
  base,
  baseSepolia,
  arbitrum,
  arbitrumSepolia,
  optimism,
  optimismSepolia,
  polygon,
  polygonAmoy,
} from "@reown/appkit/networks";
import { getDefaultChainConfig, CHAIN_CONFIGS } from "@/lib/chain-config";

export const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

const ALL_APPKIT_NETWORKS: Record<number, AppKitNetwork> = {
  [mainnet.id]: mainnet,
  [sepolia.id]: sepolia,
  [base.id]: base,
  [baseSepolia.id]: baseSepolia,
  [arbitrum.id]: arbitrum,
  [arbitrumSepolia.id]: arbitrumSepolia,
  [optimism.id]: optimism,
  [optimismSepolia.id]: optimismSepolia,
  [polygon.id]: polygon,
  [polygonAmoy.id]: polygonAmoy,
};

// Filter to only include networks that exist in CHAIN_CONFIGS (respects NEXT_PUBLIC_TESTNET_ONLY)
const APPKIT_NETWORKS: Record<number, AppKitNetwork> = Object.fromEntries(
  Object.entries(ALL_APPKIT_NETWORKS).filter(([id]) => Number(id) in CHAIN_CONFIGS)
);

const defaultChainId = getDefaultChainConfig().chain.id;
const appkitNetworkList = Object.values(APPKIT_NETWORKS);
const defaultNetwork = APPKIT_NETWORKS[defaultChainId] ?? appkitNetworkList[0];

// Put the default network first so AppKit uses it as the initial selection
export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [
  defaultNetwork,
  ...appkitNetworkList.filter((n) => n.id !== defaultNetwork.id),
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

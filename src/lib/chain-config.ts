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
} from "viem/chains";
import type { Chain } from "viem";
import type { TypedDataDomain } from "viem";

export interface ChainConfig {
  chain: Chain;
  usdcAddress: `0x${string}`;
  usdcDomain: TypedDataDomain;
  networkString: string;
  explorerUrl: string;
}

const TESTNET_ONLY =
  process.env.NEXT_PUBLIC_TESTNET_ONLY === "true";

const ALL_CHAIN_CONFIGS: Record<number, ChainConfig> = {
  // Ethereum Mainnet
  1: {
    chain: mainnet,
    usdcAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    usdcDomain: {
      name: "USD Coin",
      version: "2",
      chainId: 1,
      verifyingContract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    },
    networkString: "eip155:1",
    explorerUrl: "https://etherscan.io",
  },
  // Ethereum Sepolia
  11155111: {
    chain: sepolia,
    usdcAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    usdcDomain: {
      name: "USDC",
      version: "2",
      chainId: 11155111,
      verifyingContract: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    },
    networkString: "eip155:11155111",
    explorerUrl: "https://sepolia.etherscan.io",
  },
  // Base Mainnet
  8453: {
    chain: base,
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    usdcDomain: {
      name: "USD Coin",
      version: "2",
      chainId: 8453,
      verifyingContract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    },
    networkString: "eip155:8453",
    explorerUrl: "https://basescan.org",
  },
  // Base Sepolia
  84532: {
    chain: baseSepolia,
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    usdcDomain: {
      name: "USDC",
      version: "2",
      chainId: 84532,
      verifyingContract: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    },
    networkString: "eip155:84532",
    explorerUrl: "https://sepolia.basescan.org",
  },
  // Arbitrum One
  42161: {
    chain: arbitrum,
    usdcAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    usdcDomain: {
      name: "USD Coin",
      version: "2",
      chainId: 42161,
      verifyingContract: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    },
    networkString: "eip155:42161",
    explorerUrl: "https://arbiscan.io",
  },
  // Arbitrum Sepolia
  421614: {
    chain: arbitrumSepolia,
    usdcAddress: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    usdcDomain: {
      name: "USD Coin",
      version: "2",
      chainId: 421614,
      verifyingContract: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    },
    networkString: "eip155:421614",
    explorerUrl: "https://sepolia.arbiscan.io",
  },
  // Optimism
  10: {
    chain: optimism,
    usdcAddress: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    usdcDomain: {
      name: "USD Coin",
      version: "2",
      chainId: 10,
      verifyingContract: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    },
    networkString: "eip155:10",
    explorerUrl: "https://optimistic.etherscan.io",
  },
  // OP Sepolia
  11155420: {
    chain: optimismSepolia,
    usdcAddress: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
    usdcDomain: {
      name: "USD Coin",
      version: "2",
      chainId: 11155420,
      verifyingContract: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
    },
    networkString: "eip155:11155420",
    explorerUrl: "https://sepolia-optimism.etherscan.io",
  },
  // Polygon
  137: {
    chain: polygon,
    usdcAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    usdcDomain: {
      name: "USD Coin",
      version: "2",
      chainId: 137,
      verifyingContract: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    },
    networkString: "eip155:137",
    explorerUrl: "https://polygonscan.com",
  },
  // Polygon Amoy
  80002: {
    chain: polygonAmoy,
    usdcAddress: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
    usdcDomain: {
      name: "USDC",
      version: "2",
      chainId: 80002,
      verifyingContract: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
    },
    networkString: "eip155:80002",
    explorerUrl: "https://amoy.polygonscan.com",
  },
};

export const CHAIN_CONFIGS: Record<number, ChainConfig> = TESTNET_ONLY
  ? Object.fromEntries(
      Object.entries(ALL_CHAIN_CONFIGS).filter(
        ([, cfg]) => cfg.chain.testnet === true
      )
    )
  : ALL_CHAIN_CONFIGS;

export const SUPPORTED_CHAINS: ChainConfig[] = Object.values(CHAIN_CONFIGS);

export function getChainConfig(chainId: number): ChainConfig | undefined {
  return CHAIN_CONFIGS[chainId];
}

/**
 * Returns all network identifiers that may appear in a 402 payment requirement
 * for this chain (e.g. "eip155:8453" and "base"). Use when matching stored
 * requirements that might use either EIP-155 or plain chain names.
 */
export function getNetworkIdentifiers(config: ChainConfig): string[] {
  const normalizedName = config.chain.name.toLowerCase().replace(/\s+/g, "-");
  return [config.networkString, normalizedName];
}

export function isChainSupported(chainId: number): boolean {
  return chainId in CHAIN_CONFIGS;
}

const DEFAULT_MAINNET_CHAIN_ID = 8453;
const DEFAULT_TESTNET_CHAIN_ID = 84532;

const defaultChainId = parseInt(
  process.env.NEXT_PUBLIC_CHAIN_ID || String(DEFAULT_MAINNET_CHAIN_ID),
  10
);

export function getDefaultChainConfig(): ChainConfig {
  const fallbackId = TESTNET_ONLY
    ? DEFAULT_TESTNET_CHAIN_ID
    : DEFAULT_MAINNET_CHAIN_ID;
  return CHAIN_CONFIGS[defaultChainId] ?? CHAIN_CONFIGS[fallbackId];
}

/**
 * Returns chain configs matching the current environment (testnet vs mainnet).
 * When running with a testnet default chain, returns only testnet chains; otherwise only mainnets.
 */
export function getEnvironmentChains(): ChainConfig[] {
  const defaultConfig = getDefaultChainConfig();
  const isTestnet = defaultConfig.chain.testnet === true;
  return SUPPORTED_CHAINS.filter((c) => (c.chain.testnet === true) === isTestnet);
}

// Backward-compatible alias — deprecated, use getDefaultChainConfig()
export const chainConfig: ChainConfig = getDefaultChainConfig();

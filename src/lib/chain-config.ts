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
import { createPublicClient, formatUnits, http, parseUnits } from "viem";
import type { Chain } from "viem";
import type { TypedDataDomain } from "viem";

export interface ChainConfig {
  chain: Chain;
  usdcAddress: `0x${string}`;
  usdcDomain: TypedDataDomain;
  networkString: string;
  explorerUrl: string;
  slug: string;
  displayName: string;
  isTestnet: boolean;
  color: string;
  aliases: string[];
}

export interface TokenConfig {
  symbol: string;
  decimals: number;
  displayDecimals: number;
  formatAmount: (amountSmallestUnit: bigint) => string;
  parseAmount: (humanReadable: string) => bigint;
}

function makeTokenConfig(symbol: string, decimals: number, displayDecimals: number): TokenConfig {
  return {
    symbol,
    decimals,
    displayDecimals,
    formatAmount(amountSmallestUnit: bigint): string {
      return formatUnits(amountSmallestUnit, decimals);
    },
    parseAmount(humanReadable: string): bigint {
      return parseUnits(humanReadable, decimals);
    },
  };
}

export const CHAIN_CONFIGS: Record<number, ChainConfig> = {
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
    slug: "ethereum",
    displayName: "Ethereum",
    isTestnet: false,
    color: "bg-gray-500",
    aliases: ["eth", "mainnet", "eth-mainnet"],
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
    slug: "sepolia",
    displayName: "Sepolia",
    isTestnet: true,
    color: "bg-gray-500",
    aliases: ["eth-sepolia"],
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
    slug: "base",
    displayName: "Base",
    isTestnet: false,
    color: "bg-blue-500",
    aliases: [],
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
    slug: "base-sepolia",
    displayName: "Base Sepolia",
    isTestnet: true,
    color: "bg-blue-500",
    aliases: [],
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
    slug: "arbitrum",
    displayName: "Arbitrum One",
    isTestnet: false,
    color: "bg-sky-500",
    aliases: ["arbitrum-one"],
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
    slug: "arbitrum-sepolia",
    displayName: "Arbitrum Sepolia",
    isTestnet: true,
    color: "bg-sky-500",
    aliases: [],
  },
  // OP Mainnet
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
    slug: "optimism",
    displayName: "OP Mainnet",
    isTestnet: false,
    color: "bg-red-500",
    aliases: ["op-mainnet"],
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
    slug: "op-sepolia",
    displayName: "OP Sepolia",
    isTestnet: true,
    color: "bg-red-500",
    aliases: [],
  },
  // Polygon PoS
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
    slug: "polygon",
    displayName: "Polygon PoS",
    isTestnet: false,
    color: "bg-purple-500",
    aliases: ["polygon-pos"],
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
    slug: "polygon-amoy",
    displayName: "Polygon Amoy",
    isTestnet: true,
    color: "bg-purple-500",
    aliases: [],
  },
};

// ── Token registry ─────────────────────────────────────────────────
// Per-chain token configs keyed by lowercase token address.

const USDC_TOKEN_CONFIG = makeTokenConfig("USDC", 6, 2);

const CHAIN_TOKENS: Record<number, Record<string, TokenConfig>> = {};
for (const [chainIdStr, config] of Object.entries(CHAIN_CONFIGS)) {
  const chainId = Number(chainIdStr);
  CHAIN_TOKENS[chainId] = {
    [config.usdcAddress.toLowerCase()]: USDC_TOKEN_CONFIG,
  };
}

// ── Chain helpers ──────────────────────────────────────────────────

export const SUPPORTED_CHAINS: ChainConfig[] = Object.values(CHAIN_CONFIGS);

export function getChainById(chainId: number): ChainConfig | undefined {
  return CHAIN_CONFIGS[chainId];
}

/** @deprecated Use getChainById() */
export const getChainConfig = getChainById;

export function getChainBySlug(slug: string): ChainConfig | undefined {
  const lower = slug.toLowerCase();
  return SUPPORTED_CHAINS.find((c) => c.slug === lower);
}

export function getAllChains(): ChainConfig[] {
  return SUPPORTED_CHAINS;
}

export function getTestnetChains(): ChainConfig[] {
  return SUPPORTED_CHAINS.filter((c) => c.isTestnet);
}

export function getMainnetChains(): ChainConfig[] {
  return SUPPORTED_CHAINS.filter((c) => !c.isTestnet);
}

export function isTestnetChain(chainId: number): boolean {
  return CHAIN_CONFIGS[chainId]?.isTestnet === true;
}

export function isMainnetChain(chainId: number): boolean {
  const config = CHAIN_CONFIGS[chainId];
  return config !== undefined && !config.isTestnet;
}

/**
 * Resolve a chain from a flexible input string.
 * Accepts: slug ("base-sepolia"), alias ("eth", "mainnet"), displayName ("OP Mainnet"),
 * numeric string ("84532"), or CAIP-2 ("eip155:84532").
 */
export function resolveChain(nameOrId: string): ChainConfig | undefined {
  const input = nameOrId.trim();

  // Try CAIP-2 format: "eip155:84532"
  const caip2Match = input.match(/^eip155:(\d+)$/);
  if (caip2Match) {
    const chainId = parseInt(caip2Match[1], 10);
    return CHAIN_CONFIGS[chainId];
  }

  // Try numeric chain ID
  const asNumber = parseInt(input, 10);
  if (!isNaN(asNumber) && String(asNumber) === input) {
    return CHAIN_CONFIGS[asNumber];
  }

  // Try slug, alias, or displayName (case-insensitive)
  const lower = input.toLowerCase();
  return SUPPORTED_CHAINS.find(
    (c) =>
      c.slug === lower ||
      c.aliases.some((a) => a.toLowerCase() === lower) ||
      c.displayName.toLowerCase() === lower,
  );
}

// ── Token helpers ──────────────────────────────────────────────────

export function getTokenConfig(chainId: number, tokenAddress: string): TokenConfig | undefined {
  return CHAIN_TOKENS[chainId]?.[tokenAddress.toLowerCase()];
}

export function getUsdcConfig(chainId: number): TokenConfig | undefined {
  const config = CHAIN_CONFIGS[chainId];
  if (!config) return undefined;
  return CHAIN_TOKENS[chainId]?.[config.usdcAddress.toLowerCase()];
}

export function formatTokenAmount(chainId: number, tokenAddress: string, amountRaw: bigint): string {
  const token = getTokenConfig(chainId, tokenAddress);
  if (!token) return formatUnits(amountRaw, 18);
  return token.formatAmount(amountRaw);
}

export function parseTokenAmount(chainId: number, tokenAddress: string, humanReadable: string): bigint {
  const token = getTokenConfig(chainId, tokenAddress);
  if (!token) return parseUnits(humanReadable, 18);
  return token.parseAmount(humanReadable);
}

// ── Existing helpers ───────────────────────────────────────────────

export function getNetworkIdentifiers(config: ChainConfig): string[] {
  return [config.networkString, config.slug, ...config.aliases];
}

export function isChainSupported(chainId: number): boolean {
  return chainId in CHAIN_CONFIGS;
}

/**
 * All HTTP RPC URLs from supported chains (viem chain.rpcUrls).
 * Used by CSP connect-src so browser can allow viem/wagmi RPC calls.
 */
export function getChainRpcUrlsForCsp(): string[] {
  const seen = new Set<string>();
  for (const config of SUPPORTED_CHAINS) {
    const urls = config.chain.rpcUrls;
    for (const key of Object.keys(urls)) {
      const entry = urls[key as keyof typeof urls];
      if (entry?.http) {
        for (const url of entry.http) {
          if (url && typeof url === "string") seen.add(url);
        }
      }
    }
  }
  return [...seen];
}

const defaultChainId = parseInt(
  process.env.NEXT_PUBLIC_CHAIN_ID || "8453",
  10
);

export function getDefaultChainConfig(): ChainConfig {
  return CHAIN_CONFIGS[defaultChainId] ?? CHAIN_CONFIGS[8453];
}

/**
 * Returns chain configs matching the current environment (testnet vs mainnet).
 * When running with a testnet default chain, returns only testnet chains; otherwise only mainnets.
 */
export function getEnvironmentChains(): ChainConfig[] {
  const defaultConfig = getDefaultChainConfig();
  return SUPPORTED_CHAINS.filter((c) => c.isTestnet === defaultConfig.isTestnet);
}

/**
 * Validate a preferred chain ID against the user's enabled chains.
 * Falls back to the first enabled chain when preferred is not in the list.
 */
export function resolveValidChainId(
  preferredChainId: number,
  enabledChainIds?: number[],
): number {
  if (!enabledChainIds || enabledChainIds.length === 0) return preferredChainId;
  if (enabledChainIds.includes(preferredChainId)) return preferredChainId;
  return enabledChainIds[0];
}

// Backward-compatible alias — deprecated, use getDefaultChainConfig()
export const chainConfig: ChainConfig = getDefaultChainConfig();

// ── Alchemy RPC helpers ────────────────────────────────────────────

const ALCHEMY_SUBDOMAINS: Record<number, string> = {
  1:        "eth-mainnet",
  11155111: "eth-sepolia",
  8453:     "base-mainnet",
  84532:    "base-sepolia",
  42161:    "arb-mainnet",
  421614:   "arb-sepolia",
  10:       "opt-mainnet",
  11155420: "opt-sepolia",
  137:      "polygon-mainnet",
  80002:    "polygon-amoy",
};

/**
 * Returns the Alchemy RPC URL for the given chain if ALCHEMY_API_KEY is set,
 * otherwise undefined (viem will fall back to chain defaults).
 * Server-only — never access process.env.ALCHEMY_API_KEY in client code.
 */
export function getAlchemyRpcUrl(chainId: number): string | undefined {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) return undefined;
  const subdomain = ALCHEMY_SUBDOMAINS[chainId];
  if (!subdomain) return undefined;
  return `https://${subdomain}.g.alchemy.com/v2/${key}`;
}

/**
 * Creates a viem public client for the given chain, using Alchemy RPC when
 * ALCHEMY_API_KEY is set, falling back to viem's built-in chain defaults.
 * This is the single place to configure public RPC transport for all
 * server-side chain reads.
 */
export function createChainPublicClient(chainId: number) {
  const config = CHAIN_CONFIGS[chainId];
  if (!config) throw new Error(`Unsupported chain: ${chainId}`);
  return createPublicClient({
    chain: config.chain,
    transport: http(getAlchemyRpcUrl(chainId)),
  });
}

// ── ZeroDev RPC helpers ────────────────────────────────────────────

function getZeroDevProjectId(): string {
  const id = process.env.ZERODEV_PROJECT_ID;
  if (!id) throw new Error("Missing required env var: ZERODEV_PROJECT_ID");
  return id;
}

export function getZeroDevBundlerRpc(chainId: number): string {
  return `https://rpc.zerodev.app/api/v3/${getZeroDevProjectId()}/chain/${chainId}`;
}

export function getZeroDevPaymasterRpc(chainId: number): string {
  return `https://rpc.zerodev.app/api/v3/${getZeroDevProjectId()}/chain/${chainId}`;
}

/**
 * Returns the ZeroDev ERC-20 gas token address for USDC on a given chain.
 * Used by the session key authorization flow to pay gas in USDC when free
 * gas sponsorship is unavailable. Returns undefined for chains where ZeroDev
 * does not support USDC as a gas token (most testnets).
 *
 * Addresses sourced from @zerodev/sdk gasTokenAddresses.
 * Client-safe — no process.env access.
 */
export function getUsdcGasTokenAddress(chainId: number): `0x${string}` | undefined {
  const addresses: Record<number, `0x${string}`> = {
    1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",       // Ethereum
    10: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",      // OP Mainnet
    137: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",     // Polygon
    8453: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",    // Base
    42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",   // Arbitrum One
    11155111: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // Ethereum Sepolia
  };
  return addresses[chainId];
}

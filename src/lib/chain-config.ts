import { base, baseSepolia } from "viem/chains";
import type { Chain } from "viem";
import type { TypedDataDomain } from "viem";

interface ChainConfig {
  chain: Chain;
  usdcAddress: `0x${string}`;
  usdcDomain: TypedDataDomain;
  networkString: string;
  explorerUrl: string;
}

const CHAIN_CONFIGS: Record<number, ChainConfig> = {
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
  84532: {
    chain: baseSepolia,
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    usdcDomain: {
      name: "USD Coin",
      version: "2",
      chainId: 84532,
      verifyingContract: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    },
    networkString: "eip155:84532",
    explorerUrl: "https://sepolia.basescan.org",
  },
};

const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || "8453", 10);

export const chainConfig: ChainConfig =
  CHAIN_CONFIGS[chainId] ?? CHAIN_CONFIGS[8453];

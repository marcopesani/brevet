import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ChainConfig } from "@/lib/chain-config";

// Mainnet chain IDs
const MAINNET_IDS = [1, 8453, 42161, 10, 137];
// Testnet chain IDs
const TESTNET_IDS = [11155111, 84532, 421614, 11155420, 80002];

/**
 * Helper to import chain-config.ts with a fresh module scope.
 * Must call vi.resetModules() before this so module-level constants
 * re-evaluate with the current process.env values.
 */
async function importChainConfig() {
  const mod = await import("@/lib/chain-config");
  return mod;
}

describe("chain-config", () => {
  beforeEach(() => {
    vi.resetModules();
    // Reset to defaults — tests override as needed
    delete process.env.NEXT_PUBLIC_TESTNET_ONLY;
    process.env.NEXT_PUBLIC_CHAIN_ID = "84532";
  });

  describe("when NEXT_PUBLIC_TESTNET_ONLY is unset (default)", () => {
    it("SUPPORTED_CHAINS contains all 10 chains", async () => {
      const { SUPPORTED_CHAINS } = await importChainConfig();
      expect(SUPPORTED_CHAINS).toHaveLength(10);
    });

    it("CHAIN_CONFIGS contains entries for all mainnet and testnet IDs", async () => {
      const { CHAIN_CONFIGS } = await importChainConfig();
      for (const id of [...MAINNET_IDS, ...TESTNET_IDS]) {
        expect(CHAIN_CONFIGS[id]).toBeDefined();
      }
    });

    it("getChainConfig returns config for mainnet IDs", async () => {
      const { getChainConfig } = await importChainConfig();
      for (const id of MAINNET_IDS) {
        expect(getChainConfig(id)).toBeDefined();
      }
    });

    it("isChainSupported returns true for all chain IDs", async () => {
      const { isChainSupported } = await importChainConfig();
      for (const id of [...MAINNET_IDS, ...TESTNET_IDS]) {
        expect(isChainSupported(id)).toBe(true);
      }
    });
  });

  describe('when NEXT_PUBLIC_TESTNET_ONLY is "true"', () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_TESTNET_ONLY = "true";
    });

    it("SUPPORTED_CHAINS contains only 5 testnet chains", async () => {
      const { SUPPORTED_CHAINS } = await importChainConfig();
      expect(SUPPORTED_CHAINS).toHaveLength(5);
      const chainIds = SUPPORTED_CHAINS.map((c: ChainConfig) => c.chain.id);
      expect(chainIds.sort()).toEqual([...TESTNET_IDS].sort());
    });

    it("CHAIN_CONFIGS does not contain mainnet keys", async () => {
      const { CHAIN_CONFIGS } = await importChainConfig();
      for (const id of MAINNET_IDS) {
        expect(CHAIN_CONFIGS[id]).toBeUndefined();
      }
    });

    it("CHAIN_CONFIGS contains all testnet keys", async () => {
      const { CHAIN_CONFIGS } = await importChainConfig();
      for (const id of TESTNET_IDS) {
        expect(CHAIN_CONFIGS[id]).toBeDefined();
      }
    });

    it("getChainConfig returns undefined for mainnet IDs", async () => {
      const { getChainConfig } = await importChainConfig();
      for (const id of MAINNET_IDS) {
        expect(getChainConfig(id)).toBeUndefined();
      }
    });

    it("getChainConfig returns config for testnet IDs", async () => {
      const { getChainConfig } = await importChainConfig();
      for (const id of TESTNET_IDS) {
        expect(getChainConfig(id)).toBeDefined();
        expect(getChainConfig(id)!.chain.id).toBe(id);
      }
    });

    it("isChainSupported returns false for mainnet IDs", async () => {
      const { isChainSupported } = await importChainConfig();
      for (const id of MAINNET_IDS) {
        expect(isChainSupported(id)).toBe(false);
      }
    });

    it("isChainSupported returns true for testnet IDs", async () => {
      const { isChainSupported } = await importChainConfig();
      for (const id of TESTNET_IDS) {
        expect(isChainSupported(id)).toBe(true);
      }
    });

    it("getDefaultChainConfig returns Base Sepolia when NEXT_PUBLIC_CHAIN_ID is a mainnet", async () => {
      process.env.NEXT_PUBLIC_CHAIN_ID = "8453";
      vi.resetModules();
      const { getDefaultChainConfig } = await importChainConfig();
      const config = getDefaultChainConfig();
      expect(config.chain.id).toBe(84532);
    });

    it("getDefaultChainConfig preserves testnet chain ID when already testnet", async () => {
      process.env.NEXT_PUBLIC_CHAIN_ID = "421614";
      vi.resetModules();
      const { getDefaultChainConfig } = await importChainConfig();
      const config = getDefaultChainConfig();
      expect(config.chain.id).toBe(421614);
    });

    it("getEnvironmentChains returns only testnet chains", async () => {
      const { getEnvironmentChains } = await importChainConfig();
      const chains = getEnvironmentChains();
      expect(chains.length).toBeGreaterThan(0);
      for (const c of chains) {
        expect(c.chain.testnet).toBe(true);
      }
    });
  });

  describe('when NEXT_PUBLIC_TESTNET_ONLY is "false"', () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_TESTNET_ONLY = "false";
    });

    it("SUPPORTED_CHAINS contains all 10 chains (same as unset)", async () => {
      const { SUPPORTED_CHAINS } = await importChainConfig();
      expect(SUPPORTED_CHAINS).toHaveLength(10);
    });

    it("CHAIN_CONFIGS contains entries for all chain IDs", async () => {
      const { CHAIN_CONFIGS } = await importChainConfig();
      for (const id of [...MAINNET_IDS, ...TESTNET_IDS]) {
        expect(CHAIN_CONFIGS[id]).toBeDefined();
      }
    });

    it("getChainConfig returns config for mainnet IDs", async () => {
      const { getChainConfig } = await importChainConfig();
      for (const id of MAINNET_IDS) {
        expect(getChainConfig(id)).toBeDefined();
      }
    });

    it("isChainSupported returns true for all chain IDs", async () => {
      const { isChainSupported } = await importChainConfig();
      for (const id of [...MAINNET_IDS, ...TESTNET_IDS]) {
        expect(isChainSupported(id)).toBe(true);
      }
    });
  });

  describe("getEnvironmentChains", () => {
    it("returns testnet chains when default chain is testnet", async () => {
      process.env.NEXT_PUBLIC_CHAIN_ID = "84532";
      vi.resetModules();
      const { getEnvironmentChains } = await importChainConfig();
      const chains = getEnvironmentChains();
      for (const c of chains) {
        expect(c.chain.testnet).toBe(true);
      }
    });

    it("returns mainnet chains when default chain is mainnet", async () => {
      process.env.NEXT_PUBLIC_CHAIN_ID = "8453";
      vi.resetModules();
      const { getEnvironmentChains } = await importChainConfig();
      const chains = getEnvironmentChains();
      for (const c of chains) {
        expect(c.chain.testnet).toBeFalsy();
      }
    });

    it("respects testnet-only flag — returns only testnets", async () => {
      process.env.NEXT_PUBLIC_TESTNET_ONLY = "true";
      process.env.NEXT_PUBLIC_CHAIN_ID = "84532";
      vi.resetModules();
      const { getEnvironmentChains } = await importChainConfig();
      const chains = getEnvironmentChains();
      expect(chains).toHaveLength(5);
      const chainIds = chains.map((c: ChainConfig) => c.chain.id);
      expect(chainIds.sort()).toEqual([...TESTNET_IDS].sort());
    });
  });
});

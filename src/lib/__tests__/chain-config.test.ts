import { describe, it, expect } from "vitest";
import {
  getChainById,
  getChainBySlug,
  getAllChains,
  getTestnetChains,
  getMainnetChains,
  isTestnetChain,
  isMainnetChain,
  resolveChain,
  resolveValidChainId,
  getUsdcConfig,
  getTokenConfig,
  formatTokenAmount,
  parseTokenAmount,
  getDefaultChainConfig,
  getEnvironmentChains,
  isChainSupported,
  getNetworkIdentifiers,
} from "../chain-config";

describe("getChainById", () => {
  it("returns config for known chain ID", () => {
    const config = getChainById(8453);
    expect(config).toBeDefined();
    expect(config!.displayName).toBe("Base");
    expect(config!.slug).toBe("base");
  });

  it("returns undefined for unknown chain ID", () => {
    expect(getChainById(999999)).toBeUndefined();
  });
});

describe("getChainBySlug", () => {
  it("returns config for known slug", () => {
    const config = getChainBySlug("base-sepolia");
    expect(config).toBeDefined();
    expect(config!.chain.id).toBe(84532);
    expect(config!.isTestnet).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(getChainBySlug("BASE-SEPOLIA")).toBeDefined();
  });

  it("returns undefined for unknown slug", () => {
    expect(getChainBySlug("not-a-chain")).toBeUndefined();
  });
});

describe("getAllChains", () => {
  it("returns all 10 supported chains", () => {
    const chains = getAllChains();
    expect(chains.length).toBe(10);
  });
});

describe("getTestnetChains / getMainnetChains", () => {
  it("returns only testnet chains", () => {
    const testnets = getTestnetChains();
    expect(testnets.length).toBe(5);
    for (const c of testnets) {
      expect(c.isTestnet).toBe(true);
    }
  });

  it("returns only mainnet chains", () => {
    const mainnets = getMainnetChains();
    expect(mainnets.length).toBe(5);
    for (const c of mainnets) {
      expect(c.isTestnet).toBe(false);
    }
  });
});

describe("isTestnetChain / isMainnetChain", () => {
  it("correctly identifies testnet chains", () => {
    expect(isTestnetChain(84532)).toBe(true);
    expect(isTestnetChain(8453)).toBe(false);
  });

  it("correctly identifies mainnet chains", () => {
    expect(isMainnetChain(8453)).toBe(true);
    expect(isMainnetChain(84532)).toBe(false);
  });

  it("returns false for unknown chains", () => {
    expect(isTestnetChain(999999)).toBe(false);
    expect(isMainnetChain(999999)).toBe(false);
  });
});

describe("resolveChain", () => {
  it("resolves by slug", () => {
    const config = resolveChain("base-sepolia");
    expect(config).toBeDefined();
    expect(config!.chain.id).toBe(84532);
  });

  it("resolves by alias", () => {
    const config = resolveChain("eth");
    expect(config).toBeDefined();
    expect(config!.chain.id).toBe(1);
  });

  it("resolves 'mainnet' alias to Ethereum", () => {
    const config = resolveChain("mainnet");
    expect(config).toBeDefined();
    expect(config!.chain.id).toBe(1);
  });

  it("resolves by numeric string", () => {
    const config = resolveChain("84532");
    expect(config).toBeDefined();
    expect(config!.chain.id).toBe(84532);
  });

  it("resolves by CAIP-2 string", () => {
    const config = resolveChain("eip155:84532");
    expect(config).toBeDefined();
    expect(config!.chain.id).toBe(84532);
  });

  it("resolves by display name (case-insensitive)", () => {
    const config = resolveChain("OP Mainnet");
    expect(config).toBeDefined();
    expect(config!.chain.id).toBe(10);
  });

  it("resolves 'optimism' slug to OP Mainnet", () => {
    const config = resolveChain("optimism");
    expect(config).toBeDefined();
    expect(config!.chain.id).toBe(10);
    expect(config!.displayName).toBe("OP Mainnet");
  });

  it("resolves 'polygon' slug to Polygon PoS", () => {
    const config = resolveChain("polygon");
    expect(config).toBeDefined();
    expect(config!.chain.id).toBe(137);
    expect(config!.displayName).toBe("Polygon PoS");
  });

  it("resolves 'arbitrum' slug to Arbitrum One", () => {
    const config = resolveChain("arbitrum");
    expect(config).toBeDefined();
    expect(config!.chain.id).toBe(42161);
    expect(config!.displayName).toBe("Arbitrum One");
  });

  it("returns undefined for unknown input", () => {
    expect(resolveChain("not-a-chain")).toBeUndefined();
  });

  it("trims whitespace", () => {
    const config = resolveChain("  base  ");
    expect(config).toBeDefined();
    expect(config!.chain.id).toBe(8453);
  });
});

describe("token registry", () => {
  it("getUsdcConfig returns USDC config for known chain", () => {
    const token = getUsdcConfig(8453);
    expect(token).toBeDefined();
    expect(token!.symbol).toBe("USDC");
    expect(token!.decimals).toBe(6);
    expect(token!.displayDecimals).toBe(2);
  });

  it("getUsdcConfig returns undefined for unknown chain", () => {
    expect(getUsdcConfig(999999)).toBeUndefined();
  });

  it("getTokenConfig returns USDC for USDC address", () => {
    const baseConfig = getChainById(8453)!;
    const token = getTokenConfig(8453, baseConfig.usdcAddress);
    expect(token).toBeDefined();
    expect(token!.symbol).toBe("USDC");
  });

  it("getTokenConfig is case-insensitive on address", () => {
    const baseConfig = getChainById(8453)!;
    const token = getTokenConfig(8453, baseConfig.usdcAddress.toUpperCase());
    expect(token).toBeDefined();
  });

  it("getTokenConfig returns undefined for unknown token", () => {
    expect(getTokenConfig(8453, "0x0000000000000000000000000000000000000000")).toBeUndefined();
  });

  it("formatTokenAmount formats correctly", () => {
    const baseConfig = getChainById(8453)!;
    const result = formatTokenAmount(8453, baseConfig.usdcAddress, BigInt(1500000));
    expect(result).toBe("1.5");
  });

  it("parseTokenAmount parses correctly", () => {
    const baseConfig = getChainById(8453)!;
    const result = parseTokenAmount(8453, baseConfig.usdcAddress, "1.5");
    expect(result).toBe(BigInt(1500000));
  });

  it("TokenConfig.formatAmount works", () => {
    const token = getUsdcConfig(8453)!;
    expect(token.formatAmount(BigInt(1500000))).toBe("1.5");
  });

  it("TokenConfig.parseAmount works", () => {
    const token = getUsdcConfig(8453)!;
    expect(token.parseAmount("1.5")).toBe(BigInt(1500000));
  });
});

describe("display names follow ecosystem standards", () => {
  it("chain 10 is 'OP Mainnet'", () => {
    expect(getChainById(10)!.displayName).toBe("OP Mainnet");
  });

  it("chain 137 is 'Polygon PoS'", () => {
    expect(getChainById(137)!.displayName).toBe("Polygon PoS");
  });

  it("chain 42161 is 'Arbitrum One'", () => {
    expect(getChainById(42161)!.displayName).toBe("Arbitrum One");
  });
});

describe("ChainConfig fields", () => {
  it("every chain has slug, displayName, isTestnet, color, aliases", () => {
    for (const config of getAllChains()) {
      expect(typeof config.slug).toBe("string");
      expect(config.slug.length).toBeGreaterThan(0);
      expect(typeof config.displayName).toBe("string");
      expect(config.displayName.length).toBeGreaterThan(0);
      expect(typeof config.isTestnet).toBe("boolean");
      expect(typeof config.color).toBe("string");
      expect(config.color.length).toBeGreaterThan(0);
      expect(Array.isArray(config.aliases)).toBe(true);
    }
  });
});

describe("getNetworkIdentifiers", () => {
  it("returns networkString and slug", () => {
    const config = getChainById(8453)!;
    const ids = getNetworkIdentifiers(config);
    expect(ids).toContain("eip155:8453");
    expect(ids).toContain("base");
  });

  it("includes aliases for backward compat with V1 network names", () => {
    const arbitrum = getChainById(42161)!;
    const ids = getNetworkIdentifiers(arbitrum);
    expect(ids).toContain("arbitrum-one");

    const optimism = getChainById(10)!;
    const optIds = getNetworkIdentifiers(optimism);
    expect(optIds).toContain("op-mainnet");
  });
});

describe("getDefaultChainConfig", () => {
  it("returns a valid chain config", () => {
    const config = getDefaultChainConfig();
    expect(config).toBeDefined();
    expect(config.chain.id).toBeDefined();
  });
});

describe("getEnvironmentChains", () => {
  it("returns chains matching the default chain's testnet status", () => {
    const envChains = getEnvironmentChains();
    const defaultConfig = getDefaultChainConfig();
    for (const c of envChains) {
      expect(c.isTestnet).toBe(defaultConfig.isTestnet);
    }
  });
});

describe("isChainSupported", () => {
  it("returns true for supported chains", () => {
    expect(isChainSupported(8453)).toBe(true);
    expect(isChainSupported(84532)).toBe(true);
  });

  it("returns false for unsupported chains", () => {
    expect(isChainSupported(999999)).toBe(false);
  });
});

describe("resolveValidChainId", () => {
  it("returns preferredChainId when enabledChainIds is undefined", () => {
    expect(resolveValidChainId(8453, undefined)).toBe(8453);
  });

  it("returns preferredChainId when enabledChainIds is empty", () => {
    expect(resolveValidChainId(8453, [])).toBe(8453);
  });

  it("returns preferredChainId when it is in enabledChainIds", () => {
    expect(resolveValidChainId(8453, [8453, 42161])).toBe(8453);
  });

  it("returns first enabled chain when preferredChainId is not in enabledChainIds", () => {
    expect(resolveValidChainId(8453, [42161, 84532])).toBe(42161);
  });

  it("falls back to testnet when mainnet preferred but only testnets enabled", () => {
    expect(resolveValidChainId(8453, [84532, 11155111])).toBe(84532);
  });
});

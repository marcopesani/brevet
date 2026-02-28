import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "node:path";

const CURATED_PATH = path.resolve(process.cwd(), "data", "merchants.json");
const BAZAAR_PATH = path.resolve(process.cwd(), "data", "merchants-bazaar.json");

const mockReadFileSync = vi.fn();

vi.mock("node:fs", () => ({
  default: { readFileSync: (...args: unknown[]) => mockReadFileSync(...args) },
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
}));

const validCurated = [
  {
    name: "Test Service",
    url: "https://example.com/api",
    description: "A test service for x402 payments.",
    category: "service",
    chains: ["base"],
    pricing: "0.001 USDC",
  },
  {
    name: "Test Infra",
    url: "https://infra.example.com",
    description: "Infrastructure provider.",
    category: "infrastructure",
    chains: ["base", "ethereum"],
  },
];

const validBazaar = [
  {
    name: "Bazaar Service",
    url: "https://bazaar.example.com/api",
    description: "A bazaar-sourced service.",
    category: "service",
    chains: ["base"],
    pricing: "0.002 USDC",
  },
];

function mockFiles(files: Record<string, string>) {
  mockReadFileSync.mockImplementation((filePath: string) => {
    const p = String(filePath);
    if (p in files) return files[p];
    const err = new Error(`ENOENT: no such file or directory, open '${p}'`) as NodeJS.ErrnoException;
    err.code = "ENOENT";
    throw err;
  });
}

describe("merchants data module", () => {
  beforeEach(() => {
    vi.resetModules();
    mockReadFileSync.mockReset();
  });

  describe("loadMerchants", () => {
    it("loads and merges curated and bazaar entries", async () => {
      mockFiles({
        [CURATED_PATH]: JSON.stringify(validCurated),
        [BAZAAR_PATH]: JSON.stringify(validBazaar),
      });

      const { loadMerchants } = await import("./index");
      const merchants = loadMerchants();

      expect(merchants).toHaveLength(3);
      expect(merchants[0].source).toBe("curated");
      expect(merchants[2].source).toBe("bazaar");
    });

    it("tags curated entries with source 'curated'", async () => {
      mockFiles({
        [CURATED_PATH]: JSON.stringify(validCurated),
        [BAZAAR_PATH]: JSON.stringify([]),
      });

      const { loadMerchants } = await import("./index");
      const merchants = loadMerchants();

      expect(merchants.every((m) => m.source === "curated")).toBe(true);
    });

    it("tags bazaar entries with source 'bazaar'", async () => {
      mockFiles({
        [CURATED_PATH]: JSON.stringify([]),
        [BAZAAR_PATH]: JSON.stringify(validBazaar),
      });

      const { loadMerchants } = await import("./index");
      const merchants = loadMerchants();

      expect(merchants.every((m) => m.source === "bazaar")).toBe(true);
    });

    it("skips invalid entries and warns", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const mixed = [
        validCurated[0],
        { name: "Missing URL" }, // invalid — no url
        validCurated[1],
      ];
      mockFiles({
        [CURATED_PATH]: JSON.stringify(mixed),
        [BAZAAR_PATH]: JSON.stringify([]),
      });

      const { loadMerchants } = await import("./index");
      const merchants = loadMerchants();

      expect(merchants).toHaveLength(2);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("invalid entry at index 1"),
      );
      warnSpy.mockRestore();
    });

    it("deduplicates by URL — curated wins over bazaar", async () => {
      const duplicateUrl = "https://example.com/api";
      const bazaarDuplicate = {
        name: "Bazaar Duplicate",
        url: duplicateUrl,
        description: "Bazaar version of test service.",
        category: "service",
        chains: ["ethereum"],
      };
      mockFiles({
        [CURATED_PATH]: JSON.stringify(validCurated),
        [BAZAAR_PATH]: JSON.stringify([bazaarDuplicate]),
      });

      const { loadMerchants } = await import("./index");
      const merchants = loadMerchants();

      const match = merchants.filter((m) => m.url === duplicateUrl);
      expect(match).toHaveLength(1);
      expect(match[0].source).toBe("curated");
      expect(match[0].name).toBe("Test Service");
    });

    it("handles missing curated file gracefully", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockFiles({
        [BAZAAR_PATH]: JSON.stringify(validBazaar),
      });

      const { loadMerchants } = await import("./index");
      const merchants = loadMerchants();

      expect(merchants).toHaveLength(1);
      expect(merchants[0].source).toBe("bazaar");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("could not read"),
      );
      warnSpy.mockRestore();
    });

    it("handles missing bazaar file gracefully", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockFiles({
        [CURATED_PATH]: JSON.stringify(validCurated),
      });

      const { loadMerchants } = await import("./index");
      const merchants = loadMerchants();

      expect(merchants).toHaveLength(2);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("could not read"),
      );
      warnSpy.mockRestore();
    });

    it("handles malformed JSON (non-array) gracefully", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockFiles({
        [CURATED_PATH]: JSON.stringify({ not: "an array" }),
        [BAZAAR_PATH]: JSON.stringify(validBazaar),
      });

      const { loadMerchants } = await import("./index");
      const merchants = loadMerchants();

      expect(merchants).toHaveLength(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("expected array"),
      );
      warnSpy.mockRestore();
    });

    it("handles invalid JSON syntax gracefully", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockFiles({
        [CURATED_PATH]: "not valid json {{{",
        [BAZAAR_PATH]: JSON.stringify(validBazaar),
      });

      const { loadMerchants } = await import("./index");
      const merchants = loadMerchants();

      expect(merchants).toHaveLength(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("invalid JSON"),
      );
      warnSpy.mockRestore();
    });
  });

  describe("searchMerchants", () => {
    it("returns all merchants when no filters provided", async () => {
      mockFiles({
        [CURATED_PATH]: JSON.stringify(validCurated),
        [BAZAAR_PATH]: JSON.stringify(validBazaar),
      });

      const { searchMerchants } = await import("./index");
      const results = searchMerchants();

      expect(results).toHaveLength(3);
    });

    it("filters by category", async () => {
      mockFiles({
        [CURATED_PATH]: JSON.stringify(validCurated),
        [BAZAAR_PATH]: JSON.stringify(validBazaar),
      });

      const { searchMerchants } = await import("./index");
      const results = searchMerchants(undefined, "infrastructure");

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Test Infra");
    });

    it("filters by query matching name", async () => {
      mockFiles({
        [CURATED_PATH]: JSON.stringify(validCurated),
        [BAZAAR_PATH]: JSON.stringify(validBazaar),
      });

      const { searchMerchants } = await import("./index");
      const results = searchMerchants("bazaar");

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Bazaar Service");
    });

    it("filters by query matching description", async () => {
      mockFiles({
        [CURATED_PATH]: JSON.stringify(validCurated),
        [BAZAAR_PATH]: JSON.stringify(validBazaar),
      });

      const { searchMerchants } = await import("./index");
      const results = searchMerchants("infrastructure provider");

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Test Infra");
    });

    it("filters by query matching URL", async () => {
      mockFiles({
        [CURATED_PATH]: JSON.stringify(validCurated),
        [BAZAAR_PATH]: JSON.stringify(validBazaar),
      });

      const { searchMerchants } = await import("./index");
      const results = searchMerchants("infra.example.com");

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Test Infra");
    });

    it("combines query and category filters", async () => {
      mockFiles({
        [CURATED_PATH]: JSON.stringify(validCurated),
        [BAZAAR_PATH]: JSON.stringify(validBazaar),
      });

      const { searchMerchants } = await import("./index");
      const results = searchMerchants("test", "service");

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Test Service");
    });

    it("returns empty array when no matches", async () => {
      mockFiles({
        [CURATED_PATH]: JSON.stringify(validCurated),
        [BAZAAR_PATH]: JSON.stringify(validBazaar),
      });

      const { searchMerchants } = await import("./index");
      const results = searchMerchants("nonexistent");

      expect(results).toHaveLength(0);
    });
  });

  describe("getCategories", () => {
    it("returns sorted distinct categories", async () => {
      mockFiles({
        [CURATED_PATH]: JSON.stringify(validCurated),
        [BAZAAR_PATH]: JSON.stringify(validBazaar),
      });

      const { getCategories } = await import("./index");
      const categories = getCategories();

      expect(categories).toEqual(["infrastructure", "service"]);
    });

    it("returns empty array when no merchants", async () => {
      mockFiles({
        [CURATED_PATH]: JSON.stringify([]),
        [BAZAAR_PATH]: JSON.stringify([]),
      });

      const { getCategories } = await import("./index");
      const categories = getCategories();

      expect(categories).toEqual([]);
    });
  });
});

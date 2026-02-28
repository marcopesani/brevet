import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "node:path";
import { PricingSchema, EndpointSchema, MerchantEntrySchema } from "./types";

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
    description: "A test service for x402 payments.",
    category: "service",
    chains: ["base"],
    endpoints: [
      {
        url: "https://example.com/api",
        description: "Main API endpoint.",
        pricing: { fixed: 0.001 },
      },
      {
        url: "https://example.com/api/v2",
        description: "V2 API endpoint.",
        pricing: { fixed: 0.002 },
      },
    ],
  },
  {
    name: "Test Infra",
    description: "Infrastructure provider.",
    category: "infrastructure",
    chains: ["base", "ethereum"],
    endpoints: [
      {
        url: "https://infra.example.com",
        description: "Infrastructure discovery endpoint.",
      },
    ],
  },
];

const validBazaar = [
  {
    name: "Bazaar Service",
    description: "A bazaar-sourced service.",
    category: "service",
    chains: ["base"],
    endpoints: [
      {
        url: "https://bazaar.example.com/api",
        description: "Bazaar API endpoint.",
        pricing: { fixed: 0.002 },
      },
    ],
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

describe("PricingSchema", () => {
  it("accepts { fixed } variant", () => {
    expect(PricingSchema.safeParse({ fixed: 0.001 }).success).toBe(true);
  });

  it("accepts { min, max } variant", () => {
    expect(PricingSchema.safeParse({ min: 0.001, max: 0.01 }).success).toBe(true);
  });

  it("accepts { min } variant", () => {
    expect(PricingSchema.safeParse({ min: 0.001 }).success).toBe(true);
  });

  it("accepts { max } variant", () => {
    expect(PricingSchema.safeParse({ max: 0.01 }).success).toBe(true);
  });

  it("rejects { fixed, min } combo", () => {
    expect(PricingSchema.safeParse({ fixed: 1, min: 2 }).success).toBe(false);
  });

  it("rejects { fixed, max } combo", () => {
    expect(PricingSchema.safeParse({ fixed: 1, max: 2 }).success).toBe(false);
  });

  it("rejects { fixed, min, max } combo", () => {
    expect(PricingSchema.safeParse({ fixed: 1, min: 2, max: 3 }).success).toBe(false);
  });

  it("rejects empty object", () => {
    expect(PricingSchema.safeParse({}).success).toBe(false);
  });
});

describe("EndpointSchema", () => {
  it("accepts endpoint with pricing", () => {
    const result = EndpointSchema.safeParse({
      url: "https://example.com/api",
      description: "Test endpoint.",
      pricing: { fixed: 0.001 },
    });
    expect(result.success).toBe(true);
  });

  it("accepts endpoint without pricing", () => {
    const result = EndpointSchema.safeParse({
      url: "https://example.com/api",
      description: "Test endpoint.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects endpoint without url", () => {
    const result = EndpointSchema.safeParse({
      description: "No URL.",
    });
    expect(result.success).toBe(false);
  });

  it("rejects endpoint with invalid url", () => {
    const result = EndpointSchema.safeParse({
      url: "not-a-url",
      description: "Bad URL.",
    });
    expect(result.success).toBe(false);
  });
});

describe("MerchantEntrySchema", () => {
  it("accepts valid merchant with endpoints", () => {
    const result = MerchantEntrySchema.safeParse(validCurated[0]);
    expect(result.success).toBe(true);
  });

  it("rejects merchant without endpoints", () => {
    const result = MerchantEntrySchema.safeParse({
      name: "No Endpoints",
      description: "Missing endpoints.",
      category: "service",
      chains: ["base"],
      endpoints: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects merchant without name", () => {
    const result = MerchantEntrySchema.safeParse({
      description: "No name.",
      category: "service",
      chains: ["base"],
      endpoints: [{ url: "https://example.com", description: "Test." }],
    });
    expect(result.success).toBe(false);
  });
});

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
        { name: "Missing Endpoints" }, // invalid — no endpoints
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

    it("deduplicates by merchant name — curated wins over bazaar", async () => {
      const bazaarDuplicate = {
        name: "Test Service",
        description: "Bazaar version of test service.",
        category: "service",
        chains: ["ethereum"],
        endpoints: [
          {
            url: "https://bazaar.example.com/alt",
            description: "Alternative bazaar endpoint.",
          },
        ],
      };
      mockFiles({
        [CURATED_PATH]: JSON.stringify(validCurated),
        [BAZAAR_PATH]: JSON.stringify([bazaarDuplicate]),
      });

      const { loadMerchants } = await import("./index");
      const merchants = loadMerchants();

      const match = merchants.filter((m) => m.name === "Test Service");
      expect(match).toHaveLength(1);
      expect(match[0].source).toBe("curated");
      expect(match[0].description).toBe("A test service for x402 payments.");
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

    it("returns merchants with nested endpoints", async () => {
      mockFiles({
        [CURATED_PATH]: JSON.stringify(validCurated),
        [BAZAAR_PATH]: JSON.stringify([]),
      });

      const { loadMerchants } = await import("./index");
      const merchants = loadMerchants();

      const testService = merchants.find((m) => m.name === "Test Service");
      expect(testService).toBeDefined();
      expect(testService!.endpoints).toHaveLength(2);
      expect(testService!.endpoints[0].url).toBe("https://example.com/api");
      expect(testService!.endpoints[0].pricing).toEqual({ fixed: 0.001 });
      expect(testService!.endpoints[1].pricing).toEqual({ fixed: 0.002 });
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

    it("filters by query matching merchant name", async () => {
      mockFiles({
        [CURATED_PATH]: JSON.stringify(validCurated),
        [BAZAAR_PATH]: JSON.stringify(validBazaar),
      });

      const { searchMerchants } = await import("./index");
      const results = searchMerchants("bazaar");

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Bazaar Service");
    });

    it("filters by query matching merchant description", async () => {
      mockFiles({
        [CURATED_PATH]: JSON.stringify(validCurated),
        [BAZAAR_PATH]: JSON.stringify(validBazaar),
      });

      const { searchMerchants } = await import("./index");
      const results = searchMerchants("infrastructure provider");

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Test Infra");
    });

    it("filters by query matching endpoint URL", async () => {
      mockFiles({
        [CURATED_PATH]: JSON.stringify(validCurated),
        [BAZAAR_PATH]: JSON.stringify(validBazaar),
      });

      const { searchMerchants } = await import("./index");
      const results = searchMerchants("infra.example.com");

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Test Infra");
    });

    it("filters by query matching endpoint description", async () => {
      mockFiles({
        [CURATED_PATH]: JSON.stringify(validCurated),
        [BAZAAR_PATH]: JSON.stringify(validBazaar),
      });

      const { searchMerchants } = await import("./index");
      const results = searchMerchants("V2 API");

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Test Service");
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

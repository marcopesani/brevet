import fs from "node:fs";
import path from "node:path";
import { MerchantEntrySchema } from "./types";
import type { Merchant, MerchantSource } from "./types";

const DATA_DIR = path.resolve(process.cwd(), "data");
const CURATED_PATH = path.join(DATA_DIR, "merchants.json");
const BAZAAR_PATH = path.join(DATA_DIR, "merchants-bazaar.json");

function loadFile(filePath: string, source: MerchantSource): Merchant[] {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch {
    console.warn(`merchants: could not read ${filePath}, skipping`);
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(`merchants: invalid JSON in ${filePath}, skipping`);
    return [];
  }

  if (!Array.isArray(parsed)) {
    console.warn(`merchants: expected array in ${filePath}, got ${typeof parsed}, skipping`);
    return [];
  }

  const merchants: Merchant[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const result = MerchantEntrySchema.safeParse(parsed[i]);
    if (result.success) {
      merchants.push({ ...result.data, source });
    } else {
      console.warn(`merchants: invalid entry at index ${i} in ${filePath}, skipping`);
    }
  }
  return merchants;
}

export function loadMerchants(): Merchant[] {
  const curated = loadFile(CURATED_PATH, "curated");
  const bazaar = loadFile(BAZAAR_PATH, "bazaar");

  // Dedup by merchant name: curated wins
  const byName = new Map<string, Merchant>();
  for (const m of curated) {
    byName.set(m.name, m);
  }
  for (const m of bazaar) {
    if (!byName.has(m.name)) {
      byName.set(m.name, m);
    }
  }

  return Array.from(byName.values());
}

export function searchMerchants(query?: string, category?: string): Merchant[] {
  let merchants = loadMerchants();

  if (category) {
    const lower = category.toLowerCase();
    merchants = merchants.filter((m) => m.category.toLowerCase() === lower);
  }

  if (query) {
    const lower = query.toLowerCase();
    merchants = merchants.filter(
      (m) =>
        m.name.toLowerCase().includes(lower) ||
        m.description.toLowerCase().includes(lower) ||
        m.endpoints.some(
          (e) =>
            e.url.toLowerCase().includes(lower) ||
            e.description.toLowerCase().includes(lower),
        ),
    );
  }

  return merchants;
}

export function getCategories(): string[] {
  const merchants = loadMerchants();
  const categories = new Set<string>();
  for (const m of merchants) {
    categories.add(m.category);
  }
  return Array.from(categories).sort();
}

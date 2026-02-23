import fs from "node:fs";
import path from "node:path";
import { expect } from "@playwright/test";
import { testWithSynpress } from "@synthetixio/synpress";
import { metaMaskFixtures } from "@synthetixio/synpress/playwright";
import basicSetup from "../wallet-setup/basic.setup.mjs";

function resolveCachedHash() {
  const explicitHash = process.env.E2E_SYNPRESS_CACHE_HASH;
  if (explicitHash) return explicitHash;

  const cacheRoot = path.join(process.cwd(), ".cache-synpress");
  if (!fs.existsSync(cacheRoot)) return basicSetup.hash;

  const hashDir = fs
    .readdirSync(cacheRoot)
    .filter((entry) => /^[a-f0-9]{20}$/.test(entry))
    .map((entry) => ({
      entry,
      mtime: fs.statSync(path.join(cacheRoot, entry)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime)[0]?.entry;

  return hashDir ?? basicSetup.hash;
}

const walletSetup = {
  ...basicSetup,
  hash: resolveCachedHash(),
};

export const test = testWithSynpress(metaMaskFixtures(walletSetup));
export { expect };

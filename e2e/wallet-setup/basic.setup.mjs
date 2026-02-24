import { defineWalletSetup } from "@synthetixio/synpress";
import { MetaMask } from "@synthetixio/synpress/playwright";

const seedPhrase =
  process.env.E2E_METAMASK_SEED_PHRASE ??
  "test test test test test test test test test test test junk";
const password = process.env.E2E_METAMASK_PASSWORD ?? "Password123!";

export default defineWalletSetup(password, async (context, walletPage) => {
  const metamask = new MetaMask(context, walletPage, password);
  await metamask.importWallet(seedPhrase);
});

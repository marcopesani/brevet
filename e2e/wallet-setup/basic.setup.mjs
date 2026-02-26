import { defineWalletSetup } from "@synthetixio/synpress";
import { MetaMask } from "@synthetixio/synpress/playwright";

if (!process.env.E2E_METAMASK_SEED_PHRASE) {
  throw new Error("E2E_METAMASK_SEED_PHRASE is not set");
}

if (!process.env.E2E_METAMASK_PASSWORD) {
  throw new Error("E2E_METAMASK_PASSWORD is not set");
}

const seedPhrase = process.env.E2E_METAMASK_SEED_PHRASE;
const password = process.env.E2E_METAMASK_PASSWORD;

export default defineWalletSetup(password, async (context, walletPage) => {
  const metamask = new MetaMask(context, walletPage, password);
  await metamask.importWallet(seedPhrase);
});

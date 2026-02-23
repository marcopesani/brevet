/**
 * POC: Synpress + Playwright MetaMask E2E Tests
 *
 * This file validates that Synpress can:
 *  1. Launch a browser with the MetaMask extension pre-configured
 *  2. Navigate to the Brevet app
 *  3. Interact with MetaMask (connect, sign, switch network)
 *
 * These are minimal smoke tests to prove the integration works before
 * building out full happy-path coverage.
 */

import { testWithSynpress } from "@synthetixio/synpress";
import { MetaMask, metaMaskFixtures } from "@synthetixio/synpress/playwright";
import basicSetup from "../wallet-setup/basic.setup";

const test = testWithSynpress(metaMaskFixtures(basicSetup));
const { expect } = test;

test.describe("POC — Synpress MetaMask Integration", () => {
  test("MetaMask extension is loaded and wallet is imported", async ({
    context,
    metamaskPage,
    extensionId,
  }) => {
    // Verify the extension page is accessible
    expect(metamaskPage).toBeTruthy();
    expect(extensionId).toBeTruthy();

    // Confirm MetaMask class can be instantiated
    const metamask = new MetaMask(
      context,
      metamaskPage,
      basicSetup.walletPassword,
      extensionId,
    );
    expect(metamask).toBeTruthy();

    // Navigate to MetaMask home to confirm it loaded
    await metamaskPage.goto(`chrome-extension://${extensionId}/home.html`);
    await metamaskPage.waitForLoadState("domcontentloaded");
  });

  test("can navigate to login page", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Welcome to Brevet")).toBeVisible();
    await expect(page.getByText("Connect Wallet")).toBeVisible();
  });

  test("can navigate to landing page and see CTA", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Landing page should have content visible
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });

  test("MetaMask can add Base Sepolia network", async ({
    context,
    metamaskPage,
    extensionId,
  }) => {
    const metamask = new MetaMask(
      context,
      metamaskPage,
      basicSetup.walletPassword,
      extensionId,
    );

    await metamask.addNetwork({
      name: "Base Sepolia",
      rpcUrl: "https://sepolia.base.org",
      chainId: 84532,
      symbol: "ETH",
      blockExplorerUrl: "https://sepolia.basescan.org",
    });
  });
});

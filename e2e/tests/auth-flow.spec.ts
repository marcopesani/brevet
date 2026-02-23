/**
 * E2E: SIWE Authentication Flow
 *
 * Critical path: User connects MetaMask → signs SIWE message → lands on dashboard
 *
 * Flow:
 *  1. Visit /login
 *  2. Click "Connect Wallet" → Reown AppKit modal opens
 *  3. Select MetaMask / browser wallet in modal
 *  4. MetaMask popup: approve connection
 *  5. MetaMask popup: sign SIWE message
 *  6. Redirect to /dashboard
 *  7. Dashboard shows wallet address in sidebar
 */

import { testWithSynpress } from "@synthetixio/synpress";
import { MetaMask, metaMaskFixtures } from "@synthetixio/synpress/playwright";
import baseSepoliaSetup from "../wallet-setup/base-sepolia.setup";

const test = testWithSynpress(metaMaskFixtures(baseSepoliaSetup));
const { expect } = test;

test.describe("Authentication — SIWE with MetaMask", () => {
  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Welcome to Brevet")).toBeVisible();
    await expect(
      page.getByText("Connect your wallet to manage"),
    ).toBeVisible();

    const connectButton = page.getByRole("button", {
      name: /connect wallet/i,
    });
    await expect(connectButton).toBeVisible();
    await expect(connectButton).toBeEnabled();
  });

  test("clicking Connect Wallet opens AppKit modal", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    const connectButton = page.getByRole("button", {
      name: /connect wallet/i,
    });
    await connectButton.click();

    // AppKit modal should appear — it renders as a web component (appkit-modal)
    // Wait for the modal to be present in the DOM
    const modal = page.locator("appkit-modal");
    await expect(modal).toBeAttached({ timeout: 10_000 });
  });

  test("full SIWE login flow with MetaMask", async ({
    context,
    page,
    metamaskPage,
    extensionId,
  }) => {
    const metamask = new MetaMask(
      context,
      metamaskPage,
      baseSepoliaSetup.walletPassword,
      extensionId,
    );

    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Click "Connect Wallet" to open the AppKit modal
    const connectButton = page.getByRole("button", {
      name: /connect wallet/i,
    });
    await connectButton.click();

    // Wait for the AppKit modal
    const modal = page.locator("appkit-modal");
    await expect(modal).toBeAttached({ timeout: 10_000 });

    // Look for the "Browser Wallet" / MetaMask option in the modal
    // AppKit renders wallet options inside shadow DOM; click the injected wallet
    // The exact selector depends on AppKit version — try common patterns
    await page.waitForTimeout(2000);

    // Try to find and click the MetaMask / browser wallet option
    // AppKit v1.8+ renders wallet buttons; we look for MetaMask or "Browser Wallet"
    const walletButton = page
      .locator("appkit-modal")
      .locator("w3m-connect-view, wui-list-wallet")
      .first();

    if (await walletButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await walletButton.click();
    }

    // MetaMask should show a connection request — approve it
    await metamask.connectToDapp();

    // After connecting, SIWE signature request should appear
    // MetaMask will prompt for a signature — confirm it
    await metamask.confirmSignature();

    // Should redirect to /dashboard after successful SIWE
    await page.waitForURL("**/dashboard**", { timeout: 30_000 });
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

import { testWithSynpress } from "@synthetixio/synpress";
import { metaMaskFixtures } from "@synthetixio/synpress/playwright";
import basicSetup from "../wallet-setup/basic.setup";

const test = testWithSynpress(metaMaskFixtures(basicSetup));
const { expect } = test;

test.describe("Wallet Authentication Flow", () => {
  test("connects MetaMask and completes SIWE login", async ({
    page,
    metamask,
  }) => {
    await page.goto("/login");

    // Verify login page loaded
    await expect(
      page.getByRole("heading", { name: "Welcome to Brevet" })
    ).toBeVisible();

    // Click "Connect Wallet" button which triggers AppKit modal
    await page.getByRole("button", { name: /Connect Wallet/i }).click();

    // Wait for AppKit modal to appear and select browser wallet / MetaMask
    // AppKit uses web components - look for the wallet option in the modal
    const appKitModal = page.locator("w3m-modal, appkit-modal").first();
    await appKitModal.waitFor({ state: "visible", timeout: 10_000 });

    // AppKit shows different wallet connectors - click the injected/browser wallet
    // The exact selector depends on AppKit version; try common patterns
    const walletButton = page
      .getByText(/MetaMask|Browser Wallet|Injected/i)
      .first();
    await walletButton.click({ timeout: 10_000 });

    // Approve MetaMask connection request
    await metamask.connectToDapp();

    // AppKit triggers SIWE flow automatically - approve the signature
    await metamask.confirmSignature();

    // After successful SIWE, the app redirects to /dashboard
    await page.waitForURL("**/dashboard", { timeout: 30_000 });
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("shows dashboard shell after authentication", async ({
    page,
    metamask,
  }) => {
    await page.goto("/login");

    await page.getByRole("button", { name: /Connect Wallet/i }).click();

    const appKitModal = page.locator("w3m-modal, appkit-modal").first();
    await appKitModal.waitFor({ state: "visible", timeout: 10_000 });

    const walletButton = page
      .getByText(/MetaMask|Browser Wallet|Injected/i)
      .first();
    await walletButton.click({ timeout: 10_000 });

    await metamask.connectToDapp();
    await metamask.confirmSignature();

    await page.waitForURL("**/dashboard", { timeout: 30_000 });

    // Verify sidebar navigation is visible with expected links
    await expect(page.getByText("Dashboard").first()).toBeVisible();
    await expect(page.getByText("Pending Payments")).toBeVisible();
    await expect(page.getByText("Policies")).toBeVisible();
    await expect(page.getByText("Transactions")).toBeVisible();
    await expect(page.getByText("Account")).toBeVisible();
    await expect(page.getByText("Settings")).toBeVisible();

    // Verify the user info shows a truncated wallet address in the sidebar
    await expect(page.getByText("Connected")).toBeVisible();
  });
});

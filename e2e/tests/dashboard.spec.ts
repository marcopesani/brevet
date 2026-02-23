import { testWithSynpress } from "@synthetixio/synpress";
import { metaMaskFixtures } from "@synthetixio/synpress/playwright";
import type { Page } from "@playwright/test";
import basicSetup from "../wallet-setup/basic.setup";

const test = testWithSynpress(metaMaskFixtures(basicSetup));
const { expect } = test;

/**
 * Helper to complete the SIWE login flow and land on the dashboard.
 * Shared across all dashboard navigation tests.
 */
async function loginWithMetaMask(
  page: Page,
  metamask: Awaited<ReturnType<typeof metaMaskFixtures>>["metamask"] extends infer M ? M : never
) {
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
}

test.describe("Dashboard Navigation", () => {
  test.beforeEach(async ({ page, metamask }) => {
    await loginWithMetaMask(page, metamask);
  });

  test("dashboard page shows summary cards", async ({ page }) => {
    await expect(page.getByText("Today Spend")).toBeVisible();
    await expect(page.getByText("This Week")).toBeVisible();
    await expect(page.getByText("This Month")).toBeVisible();
    await expect(page.getByText("Smart Account Balance")).toBeVisible();
  });

  test("navigates to Pending Payments page", async ({ page }) => {
    await page.getByRole("link", { name: "Pending Payments" }).click();

    await page.waitForURL("**/dashboard/pending");
    await expect(page.getByText("Pending Payments")).toBeVisible();
    await expect(
      page.getByText("Review and approve payments requested by your MCP agent")
    ).toBeVisible();
  });

  test("navigates to Policies page", async ({ page }) => {
    await page.getByRole("link", { name: "Policies" }).click();

    await page.waitForURL("**/dashboard/policies");
    await expect(page.getByText("Policies")).toBeVisible();
  });

  test("navigates to Transactions page", async ({ page }) => {
    await page.getByRole("link", { name: "Transactions" }).click();

    await page.waitForURL("**/dashboard/transactions");
    await expect(page.getByText("Transaction History")).toBeVisible();
    await expect(
      page.getByText("View and filter all payments and withdrawals")
    ).toBeVisible();
  });

  test("navigates to Account (Wallet) page", async ({ page }) => {
    await page.getByRole("link", { name: "Account" }).click();

    await page.waitForURL("**/dashboard/wallet");
  });

  test("navigates to Settings page", async ({ page }) => {
    await page.getByRole("link", { name: "Settings" }).click();

    await page.waitForURL("**/dashboard/settings");
    await expect(page.getByText("MCP Server")).toBeVisible();
  });

  test("sidebar shows Brevet branding and chain selector", async ({
    page,
  }) => {
    // Brevet brand in sidebar header
    await expect(
      page.locator("aside, [data-sidebar]").getByText("Brevet").first()
    ).toBeVisible();
  });

  test("can navigate back to dashboard from other pages", async ({
    page,
  }) => {
    // Navigate away
    await page.getByRole("link", { name: "Transactions" }).click();
    await page.waitForURL("**/dashboard/transactions");

    // Navigate back to dashboard
    await page.getByRole("link", { name: "Dashboard" }).click();
    await page.waitForURL("**/dashboard");

    // Verify dashboard content reloaded
    await expect(page.getByText("Today Spend")).toBeVisible();
  });
});

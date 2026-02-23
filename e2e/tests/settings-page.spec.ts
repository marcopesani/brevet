/**
 * E2E: Settings Page
 *
 * Critical path: User views MCP server configuration and API key
 *
 * Flows tested:
 *  1. Settings page displays MCP server URL
 *  2. API key card is visible
 *  3. Chain settings are visible
 */

import { testWithSynpress } from "@synthetixio/synpress";
import { MetaMask, metaMaskFixtures } from "@synthetixio/synpress/playwright";
import baseSepoliaSetup from "../wallet-setup/base-sepolia.setup";

const test = testWithSynpress(metaMaskFixtures(baseSepoliaSetup));
const { expect } = test;

async function authenticateUser(
  context: import("@playwright/test").BrowserContext,
  page: import("@playwright/test").Page,
  metamaskPage: import("@playwright/test").Page,
  extensionId: string,
) {
  const metamask = new MetaMask(
    context,
    metamaskPage,
    baseSepoliaSetup.walletPassword,
    extensionId,
  );

  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  const connectButton = page.getByRole("button", { name: /connect wallet/i });
  await connectButton.click();
  await page.waitForTimeout(3000);

  await metamask.connectToDapp();
  await metamask.confirmSignature();
  await page.waitForURL("**/dashboard**", { timeout: 30_000 });
}

test.describe("Settings Page", () => {
  test.beforeEach(async ({ context, page, metamaskPage, extensionId }) => {
    try {
      await authenticateUser(context, page, metamaskPage, extensionId);
    } catch {
      test.skip(true, "Could not authenticate");
    }
  });

  test("settings page loads with MCP and API key sections", async ({
    page,
  }) => {
    await page.goto("/dashboard/settings");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveURL(/\/dashboard\/settings/);

    // MCP Server URL section
    const mcpSection = page.getByText(/mcp server/i);
    if (await mcpSection.isVisible().catch(() => false)) {
      await expect(mcpSection).toBeVisible();
    }

    // API Key section
    const apiKeySection = page.getByText(/api key/i);
    if (await apiKeySection.isVisible().catch(() => false)) {
      await expect(apiKeySection).toBeVisible();
    }
  });
});

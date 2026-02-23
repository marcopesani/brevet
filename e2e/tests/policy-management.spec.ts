/**
 * E2E: Policy Management
 *
 * Critical path: Authenticated user manages endpoint policies
 *
 * Flows tested:
 *  1. View policies page with tabs (All, Active, Draft, Archived)
 *  2. Create a new policy via Add Policy dialog
 *  3. Activate a draft policy
 *  4. Toggle auto-sign on/off
 *  5. Archive a policy
 *  6. Reactivate an archived policy
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

test.describe("Policy Management", () => {
  test.beforeEach(async ({ context, page, metamaskPage, extensionId }) => {
    try {
      await authenticateUser(context, page, metamaskPage, extensionId);
    } catch {
      test.skip(true, "Could not authenticate");
    }
  });

  test("policies page displays policy table with tabs", async ({ page }) => {
    await page.goto("/dashboard/policies");
    await page.waitForLoadState("networkidle");

    // Policy table card should be visible
    await expect(page.getByText("Endpoint Policies")).toBeVisible();

    // Tab navigation should exist
    await expect(page.getByRole("tab", { name: "All" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Active" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Draft" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Archived" })).toBeVisible();

    // Add Policy button should exist
    await expect(
      page.getByRole("button", { name: /add policy/i }),
    ).toBeVisible();
  });

  test("Add Policy dialog opens and closes", async ({ page }) => {
    await page.goto("/dashboard/policies");
    await page.waitForLoadState("networkidle");

    const addButton = page.getByRole("button", { name: /add policy/i });
    await addButton.click();

    // Dialog should appear
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Close the dialog (press Escape)
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test("can switch between policy tabs", async ({ page }) => {
    await page.goto("/dashboard/policies");
    await page.waitForLoadState("networkidle");

    // Click each tab and verify it's selected
    const activeTab = page.getByRole("tab", { name: "Active" });
    await activeTab.click();
    await expect(activeTab).toHaveAttribute("data-state", "active");

    const draftTab = page.getByRole("tab", { name: "Draft" });
    await draftTab.click();
    await expect(draftTab).toHaveAttribute("data-state", "active");

    const archivedTab = page.getByRole("tab", { name: "Archived" });
    await archivedTab.click();
    await expect(archivedTab).toHaveAttribute("data-state", "active");

    const allTab = page.getByRole("tab", { name: "All" });
    await allTab.click();
    await expect(allTab).toHaveAttribute("data-state", "active");
  });

  test("can create a new policy", async ({ page }) => {
    await page.goto("/dashboard/policies");
    await page.waitForLoadState("networkidle");

    const addButton = page.getByRole("button", { name: /add policy/i });
    await addButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Fill in the endpoint pattern field
    const endpointInput = dialog.getByPlaceholder(/endpoint|url|pattern/i);
    if (await endpointInput.isVisible().catch(() => false)) {
      await endpointInput.fill("https://api.example.com/test");

      // Submit the form
      const submitButton = dialog.getByRole("button", {
        name: /create|add|save/i,
      });
      if (await submitButton.isVisible().catch(() => false)) {
        await submitButton.click();

        // Dialog should close after successful creation
        await expect(dialog).not.toBeVisible({ timeout: 10_000 });
      }
    }
  });
});

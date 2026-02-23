import { test, expect } from "../fixtures/synpress.mjs";
import { signInWithMetaMask } from "../helpers/auth";

test.describe("Policies happy path", () => {
  test("creates a new endpoint policy", async ({ page, metamask }) => {
    await signInWithMetaMask(page, metamask);

    await page.goto("/dashboard/policies");
    await expect(page.getByRole("heading", { name: /Endpoint Policies/i })).toBeVisible();

    const endpointPattern = `https://api-${Date.now()}.example.com/*`;

    await page.getByRole("button", { name: /Add Policy/i }).click();
    await page.getByLabel("Endpoint Pattern").fill(endpointPattern);
    await page.getByRole("button", { name: /^Create Policy$/i }).click();

    await expect(page.getByText("Policy created")).toBeVisible();
    await expect(page.getByRole("cell", { name: endpointPattern })).toBeVisible();
  });
});

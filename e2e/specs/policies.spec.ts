import { test, expect } from "../fixtures/synpress.mjs";
import { signInWithMetaMask } from "../helpers/auth";

const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

test.describe("Policies happy path", () => {
  test("creates a new endpoint policy", async ({ page, metamask }) => {
    await signInWithMetaMask(page, metamask);

    await page.goto(`${baseUrl}/dashboard/policies`);
    await expect(page.getByText(/^Endpoint Policies/i).first()).toBeVisible();

    const endpointPattern = `https://api-${Date.now()}.example.com/*`;

    await page.getByRole("button", { name: /Add Policy/i }).click();
    await page.getByLabel("Endpoint Pattern").fill(endpointPattern);
    await page.getByRole("button", { name: /^Create Policy$/i }).click();

    await expect(page.getByText("Policy created")).toBeVisible();
    await expect(page.getByRole("cell", { name: endpointPattern })).toBeVisible();
  });
});

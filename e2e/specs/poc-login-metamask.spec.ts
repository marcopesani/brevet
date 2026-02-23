import { test, expect } from "../fixtures/synpress.mjs";
import { signInWithMetaMask } from "../helpers/auth";

test.describe("POC: Synpress + MetaMask login", () => {
  test("connects wallet and signs SIWE", async ({ page, metamask }) => {
    await signInWithMetaMask(page, metamask);

    await expect(
      page.getByRole("heading", { level: 1, name: /Dashboard/i }),
    ).toBeVisible();
  });
});

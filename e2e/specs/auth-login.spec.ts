import { test, expect } from "../fixtures/synpress.mjs";
import { signInWithMetaMask } from "../helpers/auth";

test.describe("Auth happy path", () => {
  test("logs in and keeps authenticated dashboard session", async ({
    page,
    metamask,
  }) => {
    await signInWithMetaMask(page, metamask);

    await page.reload();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(
      page.getByRole("link", { name: "Pending Payments", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Connected")).toBeVisible();
  });
});

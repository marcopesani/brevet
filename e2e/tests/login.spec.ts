import { test, expect } from "@playwright/test";

test.describe("Login Page", () => {
  test("displays wallet connection card", async ({ page }) => {
    await page.goto("/login");

    await expect(
      page.getByRole("heading", { name: "Welcome to Brevet" })
    ).toBeVisible();

    await expect(
      page.getByText("Connect your wallet to manage your agent")
    ).toBeVisible();
  });

  test("shows Connect Wallet button", async ({ page }) => {
    await page.goto("/login");

    await expect(
      page.getByRole("button", { name: /Connect Wallet/i })
    ).toBeVisible();
  });

  test("displays terms notice", async ({ page }) => {
    await page.goto("/login");

    await expect(
      page.getByText("By connecting, you agree to sign a message")
    ).toBeVisible();
  });
});

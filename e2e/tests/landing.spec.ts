import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
  test("displays hero section with headline and CTA", async ({ page }) => {
    await page.goto("/");

    // Hero headline
    await expect(
      page.getByRole("heading", {
        name: "Connect your wallet. Let your agents pay.",
      })
    ).toBeVisible();

    // Hero description
    await expect(
      page.getByText("Brevet bridges AI agents to your wallet")
    ).toBeVisible();

    // CTA buttons
    await expect(
      page.getByRole("link", { name: "Get Started" }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Learn More" })
    ).toBeVisible();
  });

  test("displays badges for key value propositions", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("Built on Base")).toBeVisible();
    await expect(page.getByText("USDC Payments")).toBeVisible();
    await expect(page.getByText("Open Protocol")).toBeVisible();
  });

  test("displays How It Works section", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        name: "Agent hits a paywall. Brevet handles the rest.",
      })
    ).toBeVisible();

    // Three steps
    await expect(page.getByText("Connect & Fund")).toBeVisible();
    await expect(page.getByText("Configure Your Agent")).toBeVisible();
    await expect(page.getByText("Automatic Payments").first()).toBeVisible();
  });

  test("displays Features section", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        name: "Built for agents that need to pay for things.",
      })
    ).toBeVisible();

    await expect(page.getByText("Spending Controls")).toBeVisible();
    await expect(page.getByText("Approval Workflow")).toBeVisible();
    await expect(page.getByText("Transaction History")).toBeVisible();
    await expect(page.getByText("MCP Integration")).toBeVisible();
    await expect(page.getByText("Base Network")).toBeVisible();
  });

  test("displays footer with links", async ({ page }) => {
    await page.goto("/");

    const footer = page.locator("footer");
    await expect(footer).toBeVisible();
    await expect(footer.getByText("Brevet")).toBeVisible();
    await expect(
      footer.getByRole("link", { name: "GitHub" })
    ).toBeVisible();
    await expect(
      footer.getByRole("link", { name: "Documentation" })
    ).toBeVisible();
  });

  test("navigation header shows Log in and Get Started", async ({ page }) => {
    await page.goto("/");

    const header = page.locator("header");
    await expect(
      header.getByRole("link", { name: "Log in" })
    ).toBeVisible();
    await expect(
      header.getByRole("link", { name: "Get Started" })
    ).toBeVisible();
  });

  test("Get Started button navigates to login page", async ({ page }) => {
    await page.goto("/");

    await page
      .getByRole("link", { name: "Get Started" })
      .first()
      .click();

    await expect(page).toHaveURL("/login");
  });

  test("Log in link navigates to login page", async ({ page }) => {
    await page.goto("/");

    await page.locator("header").getByRole("link", { name: "Log in" }).click();

    await expect(page).toHaveURL("/login");
  });
});

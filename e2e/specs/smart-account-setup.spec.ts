import { test, expect } from "../fixtures/synpress.mjs";
import { signInWithMetaMask } from "../helpers/auth";
import type { Page } from "@playwright/test";

const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const seedPhrase =
  process.env.E2E_METAMASK_SEED_PHRASE ??
  "test test test test test test test test test test test junk";
const hasRealZeroDev =
  !!process.env.ZERODEV_PROJECT_ID &&
  process.env.ZERODEV_PROJECT_ID !== "e2e-zerodev-project-id";

const BASE_SEPOLIA_CHAIN_ID = 84532;

// ── helpers ───────────────────────────────────────────────────────────

async function switchToBaseSepolia(page: Page) {
  const chainTrigger = page
    .locator("button[data-slot='select-trigger']")
    .first();
  await expect(chainTrigger).toBeVisible({ timeout: 15_000 });
  await chainTrigger.click();

  const baseSepoliaOption = page.getByRole("option", {
    name: /Base Sepolia/i,
  });
  await expect(baseSepoliaOption).toBeVisible({ timeout: 5_000 });
  await baseSepoliaOption.click();

  await expect(chainTrigger).toContainText("Base Sepolia", { timeout: 5_000 });
}

async function ensureSmartAccountCreated(page: Page) {
  const setupButton = page.getByRole("button", {
    name: /Set Up on Base Sepolia/i,
  });
  const authCard = page
    .locator("[data-slot='card-title']")
    .filter({ hasText: "Authorize Session Key" });
  const usdcBalance = page.getByText(/USDC Balance/i);

  await expect
    .poll(
      async () => {
        const states = await Promise.all([
          setupButton.isVisible(),
          authCard.isVisible(),
          usdcBalance.isVisible(),
        ]);
        return states.some(Boolean);
      },
      { timeout: 30_000, message: "Wallet page did not load any known state" },
    )
    .toBe(true);

  if (await setupButton.isVisible()) {
    await setupButton.click();
    await expect(authCard).toBeVisible({ timeout: 120_000 });
  }
}

// ── tests ─────────────────────────────────────────────────────────────

test.describe("Smart account setup on Base Sepolia", () => {
  test("creates a smart account and shows pending-grant state with session key controls", async ({
    page,
    metamask,
  }) => {
    await signInWithMetaMask(page, metamask);

    await page.goto(`${baseUrl}/dashboard/wallet`);

    await switchToBaseSepolia(page);
    await ensureSmartAccountCreated(page);

    const authCard = page
      .locator("[data-slot='card-title']")
      .filter({ hasText: "Authorize Session Key" });
    await expect(authCard).toBeVisible();

    await expect(
      page.getByText("Smart Account", { exact: true }),
    ).toBeVisible();
    await expect(
      page
        .locator("code")
        .filter({ hasText: /^0x[0-9a-fA-F]{40}$/ })
        .first(),
    ).toBeVisible();

    await expect(
      page.getByLabel(/Spend Limit Per Transaction/i),
    ).toBeVisible();
    await expect(page.getByLabel(/Daily Spend Limit/i)).toBeVisible();
    await expect(page.getByText(/Expiry Period/i)).toBeVisible();

    const authorizeButton = page.getByRole("button", {
      name: /Authorize Session Key/i,
    });
    await expect(authorizeButton).toBeVisible();

    await expect(page.getByText(/Fund/i).first()).toBeVisible();
  });

  test("allows configuring spend limits", async ({ page, metamask }) => {
    await signInWithMetaMask(page, metamask);

    await page.goto(`${baseUrl}/dashboard/wallet`);

    await switchToBaseSepolia(page);
    await ensureSmartAccountCreated(page);

    const perTxInput = page.getByLabel(/Spend Limit Per Transaction/i);
    await perTxInput.clear();
    await perTxInput.fill("100");
    await expect(perTxInput).toHaveValue("100");

    const dailyInput = page.getByLabel(/Daily Spend Limit/i);
    await dailyInput.clear();
    await dailyInput.fill("1000");
    await expect(dailyInput).toHaveValue("1000");
  });

  // Full on-chain session key authorization — requires a real ZeroDev project
  // with gas sponsorship on Base Sepolia. Run with:
  //   source .env.local && npx playwright test -g "authorizes session key"
  test(
    "authorizes session key and reaches active state",
    { tag: "@onchain" },
    async ({ page, metamask }) => {
      test.skip(
        !hasRealZeroDev,
        "Needs real ZERODEV_PROJECT_ID — run with: source .env.local && npx playwright test -g 'authorizes session key'",
      );
      test.setTimeout(180_000);

      // 1. Sign in and navigate to wallet
      await signInWithMetaMask(page, metamask);
      await page.goto(`${baseUrl}/dashboard/wallet`);

      // 2. Switch to Base Sepolia
      await switchToBaseSepolia(page);

      // 3. Ensure smart account exists (create if needed)
      await ensureSmartAccountCreated(page);

      // 4. Check if already active (idempotent across runs on a reused server)
      const usdcBalance = page.getByText(/USDC Balance/i);
      if (await usdcBalance.isVisible()) {
        await expect(usdcBalance).toBeVisible();
        return;
      }

      // 5. Authorize session key via server-side test endpoint.
      //    This bypasses MetaMask (no wagmi walletClient in seed phrase mode)
      //    while still performing the real on-chain ZeroDev flow.
      const response = await page.request.post(
        `${baseUrl}/api/test/authorize-session-key`,
        {
          data: { seedPhrase, chainId: BASE_SEPOLIA_CHAIN_ID },
        },
      );

      const result = await response.json();
      expect(response.ok(), `API error: ${result.error ?? "unknown"}`).toBe(
        true,
      );
      expect(result.success).toBe(true);

      // 6. Verify the UI reflects the active state after reload
      await page.reload();
      await switchToBaseSepolia(page);
      await expect(usdcBalance).toBeVisible({ timeout: 30_000 });

      // Verify the session key status shows as active
      await expect(page.getByText("Active", { exact: true })).toBeVisible({
        timeout: 10_000,
      });
    },
  );
});

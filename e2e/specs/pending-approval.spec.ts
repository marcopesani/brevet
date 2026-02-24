import { test, expect } from "../fixtures/synpress.mjs";
import { signInWithMetaMask } from "../helpers/auth";
import { approveTypedDataSignature } from "../helpers/metamask";
import { createPendingPaymentForDevUser } from "../helpers/pending-payment";

const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const chainId = Number.parseInt(process.env.E2E_CHAIN_ID ?? "80002", 10);

test.describe("Pending payment happy path", () => {
  test("approves pending payment via MetaMask typed-data signature", async ({
    page,
    metamask,
  }) => {
    await signInWithMetaMask(page, metamask);

    const { stopServer } = await createPendingPaymentForDevUser(baseUrl);

    try {
      await page.goto(`${baseUrl}/dashboard/pending`);
      await page.reload();

      await expect
        .poll(
          async () => {
            const response = await page.request.get(
              `${baseUrl}/api/payments/pending?chainId=${chainId}`,
            );
            if (!response.ok()) return -1;
            const pending = (await response.json()) as Array<{ id: string }>;
            return pending.length;
          },
          { timeout: 60_000 },
        )
        .toBeGreaterThan(0);

      await page.reload();
      await expect(page.getByText(/paid-resource/i)).toBeVisible({ timeout: 30_000 });

      await page.getByRole("button", { name: /Approve & Sign/i }).first().click();
      if (process.env.E2E_REAL_METAMASK === "true") {
        await approveTypedDataSignature(metamask);
      }

      await expect
        .poll(
          async () => {
            const response = await page.request.get(
              `${baseUrl}/api/payments/pending?chainId=${chainId}`,
            );
            if (!response.ok()) return -1;
            const pending = (await response.json()) as Array<{ id: string }>;
            return pending.length;
          },
          { timeout: 120_000 },
        )
        .toBe(0);

      await page.goto(`${baseUrl}/dashboard/transactions`);
      await expect(page.getByText("127.0.0.1")).toBeVisible({ timeout: 60_000 });
    } finally {
      await stopServer();
    }
  });
});

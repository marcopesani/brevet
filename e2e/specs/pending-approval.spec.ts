import { test, expect } from "../fixtures/synpress.mjs";
import { signInWithMetaMask } from "../helpers/auth";
import { approveTypedDataSignature } from "../helpers/metamask";
import { createPendingPaymentForDevUser } from "../helpers/pending-payment";

const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

test.describe("Pending payment happy path", () => {
  test("approves pending payment via MetaMask typed-data signature", async ({
    page,
    metamask,
  }) => {
    await signInWithMetaMask(page, metamask);

    const { stopServer } = await createPendingPaymentForDevUser(baseUrl);

    try {
      await page.goto("/dashboard/pending");
      await page.reload();

      await expect(page.getByText(/paid-resource/i)).toBeVisible({ timeout: 60_000 });

      await page.getByRole("button", { name: /Approve & Sign/i }).first().click();
      await approveTypedDataSignature(metamask);

      await expect(page.getByText("Payment Approved")).toBeVisible({ timeout: 120_000 });

      await page.goto("/dashboard/transactions");
      await expect(page.getByText("127.0.0.1")).toBeVisible({ timeout: 60_000 });
    } finally {
      await stopServer();
    }
  });
});

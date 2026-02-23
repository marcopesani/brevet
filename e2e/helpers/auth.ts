import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { MetaMask } from "@synthetixio/synpress/playwright";
import { selectMetaMaskInAppKit } from "./appkit";

export async function signInWithMetaMask(page: Page, metamask: MetaMask) {
  await page.goto("/login");

  const connectWalletButton = page.getByTestId("connect-wallet-button");
  await expect(connectWalletButton).toBeVisible();
  await connectWalletButton.click();

  await selectMetaMaskInAppKit(page);
  await metamask.connectToDapp();
  await metamask.confirmSignature();

  await page.waitForURL("**/dashboard", { timeout: 90_000 });
  await expect(page).toHaveURL(/\/dashboard/);
}

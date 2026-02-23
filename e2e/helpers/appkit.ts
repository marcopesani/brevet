import type { Locator, Page } from "@playwright/test";

const WALLET_OPTION_PATTERNS = [
  /MetaMask/i,
  /Browser Wallet/i,
  /Browser Extension/i,
  /Injected/i,
  /Ethereum Wallet/i,
];

async function clickIfVisible(locator: Locator): Promise<boolean> {
  if ((await locator.count()) === 0) return false;
  const first = locator.first();
  if (!(await first.isVisible())) return false;
  await first.click();
  return true;
}

export async function selectMetaMaskInAppKit(page: Page): Promise<void> {
  for (const pattern of WALLET_OPTION_PATTERNS) {
    const button = page.getByRole("button", { name: pattern });
    if (await clickIfVisible(button)) {
      return;
    }
  }
}

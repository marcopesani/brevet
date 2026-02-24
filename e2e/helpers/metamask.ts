import type { MetaMask } from "@synthetixio/synpress/playwright";
import type { Locator } from "@playwright/test";

async function clickIfVisible(locator: Locator) {
  if ((await locator.count()) === 0) return false;
  const first = locator.first();
  if (!(await first.isVisible())) return false;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await first.click({ timeout: 1_000 });
      return true;
    } catch {
      if (!(await first.isVisible())) {
        return false;
      }
      await first.page().waitForTimeout(250);
    }
  }

  return false;
}

export async function prepareMetaMask(metamask: MetaMask) {
  await clickIfVisible(metamask.page.getByTestId("onboarding-complete-done"));
  const didOpenWallet = await clickIfVisible(
    metamask.page.getByRole("button", {
      name: /Open wallet/i,
    }),
  );

  if (!didOpenWallet && metamask.extensionId) {
    await metamask.page.goto(`chrome-extension://${metamask.extensionId}/home.html`);
  }

  const unlockPasswordInput = metamask.page.getByTestId("unlock-password");
  if ((await unlockPasswordInput.count()) > 0 && (await unlockPasswordInput.first().isVisible())) {
    await unlockPasswordInput.first().fill(metamask.password);
    await metamask.page.getByTestId("unlock-submit").first().click();
  }

  const appHeaderLogo = metamask.page.getByTestId("app-header-logo");
  if ((await appHeaderLogo.count()) > 0 && (await appHeaderLogo.first().isVisible())) {
    return;
  }

  await clickIfVisible(
    metamask.page.getByRole("button", {
      name: /Open wallet/i,
    }),
  );
}

export async function approveTypedDataSignature(metamask: MetaMask) {
  await prepareMetaMask(metamask);

  try {
    await metamask.approveSwitchNetwork();
  } catch {
    // No network switch request was shown.
  }

  await metamask.confirmSignature();
}

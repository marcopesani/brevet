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
  const extensionPages = metamask.context.pages().filter((page) =>
    metamask.extensionId
      ? page.url().startsWith(`chrome-extension://${metamask.extensionId}/`)
      : page.url().startsWith("chrome-extension://"),
  );

  const pagesToPrepare = extensionPages.length > 0 ? extensionPages : [metamask.page];

  for (const extensionPage of pagesToPrepare) {
    await clickIfVisible(
      extensionPage.getByRole("button", {
        name: /Restart MetaMask/i,
      }),
    );

    await clickIfVisible(
      extensionPage.getByRole("button", {
      name: /Open wallet/i,
      }),
    );
  }

  for (const extensionPage of pagesToPrepare) {
    const unlockPasswordInput = extensionPage.getByTestId("unlock-password");
    if ((await unlockPasswordInput.count()) > 0 && (await unlockPasswordInput.first().isVisible())) {
      await unlockPasswordInput.first().fill(metamask.password);
      await extensionPage.getByTestId("unlock-submit").first().click();
    }
  }
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

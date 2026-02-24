import type { MetaMask } from "@synthetixio/synpress/playwright";
import type { Locator, Page } from "@playwright/test";

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

function getExtensionPages(metamask: MetaMask): Page[] {
  if (!metamask.extensionId) {
    return [metamask.page];
  }

  const extensionPrefix = `chrome-extension://${metamask.extensionId}/`;
  const extensionPages = metamask.context
    .pages()
    .filter((page) => page.url().startsWith(extensionPrefix));

  return extensionPages.length > 0 ? extensionPages : [metamask.page];
}

async function unlockVisiblePage(page: Page, password: string) {
  const unlockPasswordInput = page.getByTestId("unlock-password");
  if ((await unlockPasswordInput.count()) === 0 || !(await unlockPasswordInput.first().isVisible())) {
    return false;
  }

  await unlockPasswordInput.first().fill(password);
  await page.getByTestId("unlock-submit").first().click();
  return true;
}

async function recoverCrashedMetaMaskPage(page: Page) {
  const restartButton = page.getByRole("button", { name: /Restart MetaMask/i });
  if ((await restartButton.count()) === 0 || !(await restartButton.first().isVisible())) {
    return false;
  }

  await restartButton.first().click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2_000);
  return true;
}

async function normalizeHomePage(page: Page, extensionId?: string) {
  if (!extensionId) return;
  const plainHomeUrl = `chrome-extension://${extensionId}/home.html`;
  if (!page.url().startsWith(plainHomeUrl)) return;
  if (page.url() === plainHomeUrl) {
    await page.goto(`${plainHomeUrl}#`);
  }
}

export async function prepareMetaMask(metamask: MetaMask) {
  const extensionPages = getExtensionPages(metamask);

  for (const page of extensionPages) {
    await recoverCrashedMetaMaskPage(page);
    await normalizeHomePage(page, metamask.extensionId);
  }

  for (const page of extensionPages) {
    await unlockVisiblePage(page, metamask.password);
  }

  for (const page of extensionPages) {
    await clickIfVisible(page.getByTestId("onboarding-complete-done"));
  }

  let didOpenWallet = false;
  for (const page of extensionPages) {
    const clicked = await clickIfVisible(
      page.getByRole("button", {
        name: /Open wallet/i,
      }),
    );
    didOpenWallet = didOpenWallet || clicked;
  }

  if (!didOpenWallet && metamask.extensionId) {
    await metamask.page.goto(`chrome-extension://${metamask.extensionId}/home.html#`);
  }

  for (const page of getExtensionPages(metamask)) {
    await recoverCrashedMetaMaskPage(page);
    await normalizeHomePage(page, metamask.extensionId);
    await unlockVisiblePage(page, metamask.password);
  }

  for (const page of getExtensionPages(metamask)) {
    const appHeaderLogo = page.getByTestId("app-header-logo");
    if ((await appHeaderLogo.count()) > 0 && (await appHeaderLogo.first().isVisible())) {
      const latestExtensionPages = getExtensionPages(metamask);
      if (latestExtensionPages.length > 1) {
        for (const extraPage of latestExtensionPages.slice(1)) {
          await extraPage.close().catch(() => undefined);
        }
      }
      return;
    }
  }

  await clickIfVisible(
    metamask.page.getByRole("button", {
      name: /Open wallet/i,
    }),
  );

  for (const page of getExtensionPages(metamask)) {
    await unlockVisiblePage(page, metamask.password);
  }

  const latestExtensionPages = getExtensionPages(metamask);
  if (latestExtensionPages.length > 1) {
    for (const extraPage of latestExtensionPages.slice(1)) {
      await extraPage.close().catch(() => undefined);
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

import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { MetaMask } from "@synthetixio/synpress/playwright";
import { selectMetaMaskInAppKit } from "./appkit";
import { prepareMetaMask } from "./metamask";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function startNotificationAutoApprover(metamask: MetaMask, timeoutMs = 30_000) {
  let active = true;

  const run = (async () => {
    const startedAt = Date.now();

    while (active && Date.now() - startedAt < timeoutMs) {
      let notificationPage = metamask.context
        .pages()
        .find((candidate) => candidate.url().includes("/notification.html"));

      if (!notificationPage) {
        try {
          notificationPage = await metamask.context.waitForEvent("page", {
            predicate: (candidate) => candidate.url().includes("/notification.html"),
            timeout: 500,
          });
        } catch {
          await sleep(100);
          continue;
        }
      }

      if (!notificationPage || notificationPage.isClosed()) {
        await sleep(100);
        continue;
      }

      try {
        const unlockPasswordInput = notificationPage.getByTestId("unlock-password");
        if ((await unlockPasswordInput.count()) > 0 && (await unlockPasswordInput.first().isVisible())) {
          await unlockPasswordInput.first().fill(metamask.password);
          await notificationPage.getByTestId("unlock-submit").first().click().catch(() => undefined);
          await sleep(120);
          continue;
        }

        const nextButton = notificationPage.getByTestId("page-container-footer-next");
        if ((await nextButton.count()) > 0 && (await nextButton.first().isVisible())) {
          await nextButton.first().click().catch(() => undefined);
          await sleep(120);
          continue;
        }

        const connectButton = notificationPage.getByRole("button", { name: /^Connect$/i });
        if ((await connectButton.count()) > 0 && (await connectButton.first().isVisible())) {
          await connectButton.first().click().catch(() => undefined);
          await sleep(120);
          continue;
        }
      } catch {
        // Notification may close while being handled.
      }

      await sleep(100);
    }
  })();

  return {
    stop: () => {
      active = false;
    },
    done: run,
  };
}

function buildSiweMessage({
  host,
  origin,
  address,
  chainId,
  nonce,
}: {
  host: string;
  origin: string;
  address: string;
  chainId: number;
  nonce: string;
}) {
  const issuedAt = new Date().toISOString();

  return `${host} wants you to sign in with your Ethereum account:
${address}

Please sign with your account

URI: ${origin}
Version: 1
Chain ID: ${chainId}
Nonce: ${nonce}
Issued At: ${issuedAt}`;
}

async function signInViaInjectedProvider(
  page: Page,
  metamask: MetaMask,
) {
  const initialOrigin = new URL(page.url()).origin;
  let activePage = page;
  const ensureActivePage = () => {
    if (!activePage.isClosed()) return activePage;

    const httpPage = metamask.context
      .pages()
      .find((candidate) => !candidate.isClosed() && candidate.url().startsWith("http"));

    if (!httpPage) {
      throw new Error("No active dapp page available for injected-provider fallback");
    }

    activePage = httpPage;
    return activePage;
  };

  const ensureActivePageOrOpen = async () => {
    try {
      return ensureActivePage();
    } catch {
      try {
        const newPage = await metamask.context.newPage();
        await newPage.goto(`${initialOrigin}/login`);
        activePage = newPage;
        return activePage;
      } catch {
        const openPages = metamask.context
          .pages()
          .filter((candidate) => !candidate.isClosed())
          .map((candidate) => candidate.url());
        throw new Error(
          `Unable to recover an active dapp page for injected-provider fallback. Open pages: ${openPages.join(", ") || "none"}`,
        );
      }
    }
  };

  const fallbackPage = await ensureActivePageOrOpen();
  const origin = new URL(fallbackPage.url()).origin;
  const host = new URL(fallbackPage.url()).host;
  const autoApprover = startNotificationAutoApprover(metamask);

  await fallbackPage.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const windowWithState = window as any;
    windowWithState.__e2eRequestAccountsResult = undefined;

    const existingButton = document.getElementById("__e2e-request-accounts-trigger");
    if (existingButton) {
      return;
    }

    const triggerButton = document.createElement("button");
    triggerButton.id = "__e2e-request-accounts-trigger";
    triggerButton.type = "button";
    triggerButton.style.position = "fixed";
    triggerButton.style.bottom = "8px";
    triggerButton.style.right = "8px";
    triggerButton.style.opacity = "0.01";
    triggerButton.style.zIndex = "2147483647";
    triggerButton.textContent = "request-accounts";
    triggerButton.addEventListener("click", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const provider = (window as any).ethereum;
      if (!provider) {
        windowWithState.__e2eRequestAccountsResult = {
          ok: false,
          error: "window.ethereum is not available",
        };
        return;
      }

      try {
        const accounts = (await provider.request({
          method: "eth_requestAccounts",
        })) as string[];
        windowWithState.__e2eRequestAccountsResult = { ok: true, accounts };
      } catch (error) {
        if (error instanceof Error) {
          windowWithState.__e2eRequestAccountsResult = {
            ok: false,
            error: error.message,
          };
          return;
        }
        if (typeof error === "object" && error !== null) {
          windowWithState.__e2eRequestAccountsResult = {
            ok: false,
            error: JSON.stringify(error),
          };
          return;
        }
        windowWithState.__e2eRequestAccountsResult = {
          ok: false,
          error: String(error),
        };
      }
    });

    document.body.appendChild(triggerButton);
  });

  async function triggerRequestAccounts() {
    const currentPage = await ensureActivePageOrOpen();
    await currentPage.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__e2eRequestAccountsResult = undefined;
    });
    await currentPage.click("#__e2e-request-accounts-trigger");
  }

  async function waitForRequestResult(timeout: number) {
    try {
      const currentPage = await ensureActivePageOrOpen();
      await currentPage.waitForFunction(
        () =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).__e2eRequestAccountsResult !== undefined,
        undefined,
        { timeout },
      );
      return true;
    } catch {
      return false;
    }
  }

  await triggerRequestAccounts();
  let hasRequestResult = await waitForRequestResult(10_000);

  if (!hasRequestResult) {
    try {
      await metamask.connectToDapp();
    } catch {
      // Best effort: provider request can still resolve without this approval call.
    }
    await triggerRequestAccounts();
    hasRequestResult = await waitForRequestResult(20_000);
  }

  if (!hasRequestResult) {
    throw new Error("eth_requestAccounts did not resolve after retry");
  }

  autoApprover.stop();
  await autoApprover.done;

  const requestAccountsResult = await (await ensureActivePageOrOpen()).evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any).__e2eRequestAccountsResult as {
      ok: boolean;
      accounts?: string[];
      error?: string;
    };
  });

  if (!requestAccountsResult.ok) {
    throw new Error(`Failed to request wallet accounts: ${requestAccountsResult.error}`);
  }

  const accounts = requestAccountsResult.accounts;
  const address = accounts[0];
  if (!address) throw new Error("No account returned from injected provider");

  const chainIdHex = await (await ensureActivePageOrOpen()).evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const provider = (window as any).ethereum;
    return provider.request({ method: "eth_chainId" }) as Promise<string>;
  });
  const chainId = parseInt(chainIdHex, 16);
  if (!Number.isFinite(chainId)) throw new Error(`Invalid chainId from provider: ${chainIdHex}`);

  const csrfResponse = await (await ensureActivePageOrOpen()).request.get(`${origin}/api/auth/csrf`);
  const csrfJson = (await csrfResponse.json()) as { csrfToken?: string };
  const nonce = csrfJson.csrfToken;
  if (!nonce) throw new Error("Could not fetch CSRF token for credentials sign-in");

  const message = buildSiweMessage({
    host,
    origin,
    address,
    chainId,
    nonce,
  });

  const signPromise = (await ensureActivePageOrOpen()).evaluate(
    async ({ messageToSign, account }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const provider = (window as any).ethereum;
      return provider.request({
        method: "personal_sign",
        params: [messageToSign, account],
      }) as Promise<string>;
    },
    { messageToSign: message, account: address },
  );

  try {
    await metamask.confirmSignature();
  } catch {
    // Signature dialog may already be approved or connected flow may differ.
  }
  const signature = await signPromise;

  const callbackResponse = await (await ensureActivePageOrOpen()).request.post(
    `${origin}/api/auth/callback/credentials?json=true`,
    {
      form: {
        csrfToken: nonce,
        message,
        signature,
        callbackUrl: `${origin}/dashboard`,
        json: "true",
      },
    },
  );

  if (!callbackResponse.ok()) {
    throw new Error(
      `Credentials callback failed with ${callbackResponse.status()}: ${await callbackResponse.text()}`,
    );
  }

  await (await ensureActivePageOrOpen()).goto("/dashboard");
}

export async function signInWithMetaMask(page: Page, metamask: MetaMask) {
  let activePage = page;

  await activePage.goto("/login");

  const connectWalletButton = activePage.getByTestId("connect-wallet-button");
  await expect(connectWalletButton).toBeVisible();
  await connectWalletButton.click();

  try {
    await attemptWalletSignIn(activePage, metamask);
  } catch {
    try {
      await prepareMetaMask(metamask);
      await attemptWalletSignIn(activePage, metamask);
      await expect(activePage).toHaveURL(/\/dashboard/);
      return;
    } catch {
      // Continue to injected-provider fallback.
    }

    if (activePage.isClosed()) {
      const candidatePage = metamask.context
        .pages()
        .find((candidate) => candidate.url().startsWith("http"));
      if (candidatePage) {
        activePage = candidatePage;
      }
    }

    await signInViaInjectedProvider(activePage, metamask);
  }

  await expect(activePage).toHaveURL(/\/dashboard/);
}

async function attemptWalletSignIn(page: Page, metamask: MetaMask) {
  const appKitModal = page.locator("w3m-modal.open");
  const hasOpenAppKitModal = (await appKitModal.count()) > 0;

  if (hasOpenAppKitModal) {
    await selectMetaMaskInAppKit(page);
  }

  const autoApprover = startNotificationAutoApprover(metamask, 45_000);
  try {
    await metamask.connectToDapp();
    await metamask.confirmSignature();
    await page.waitForURL("**/dashboard", { timeout: 90_000 });
  } finally {
    autoApprover.stop();
    await autoApprover.done;
  }
}

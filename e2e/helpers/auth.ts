import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { MetaMask } from "@synthetixio/synpress/playwright";
import { selectMetaMaskInAppKit } from "./appkit";
import { prepareMetaMask } from "./metamask";

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
  const origin = new URL(page.url()).origin;
  const host = new URL(page.url()).host;

  await page.evaluate(() => {
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
        windowWithState.__e2eRequestAccountsResult = {
          ok: false,
          error: String(error),
        };
      }
    });

    document.body.appendChild(triggerButton);
  });

  await page.click("#__e2e-request-accounts-trigger");
  const connectAttempt = metamask.connectToDapp().catch(() => undefined);

  await page.waitForFunction(
    () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__e2eRequestAccountsResult !== undefined,
    undefined,
    { timeout: 20_000 },
  );
  await connectAttempt;

  const requestAccountsResult = await page.evaluate(() => {
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

  const chainIdHex = await page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const provider = (window as any).ethereum;
    return provider.request({ method: "eth_chainId" }) as Promise<string>;
  });
  const chainId = parseInt(chainIdHex, 16);
  if (!Number.isFinite(chainId)) throw new Error(`Invalid chainId from provider: ${chainIdHex}`);

  const csrfResponse = await page.request.get(`${origin}/api/auth/csrf`);
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

  const signPromise = page.evaluate(
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

  const callbackResponse = await page.request.post(
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

  await page.goto("/dashboard");
}

export async function signInWithMetaMask(page: Page, metamask: MetaMask) {
  await prepareMetaMask(metamask);
  let activePage = page;

  await activePage.goto("/login");

  const connectWalletButton = activePage.getByTestId("connect-wallet-button");
  await expect(connectWalletButton).toBeVisible();
  await connectWalletButton.click();

  try {
    await selectMetaMaskInAppKit(activePage);
    await metamask.connectToDapp();
    await metamask.confirmSignature();
    await activePage.waitForURL("**/dashboard", { timeout: 90_000 });
  } catch {
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

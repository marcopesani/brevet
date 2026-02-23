import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { MetaMask } from "@synthetixio/synpress/playwright";
import { selectMetaMaskInAppKit } from "./appkit";

const APPKIT_LOGIN_TIMEOUT_MS = 40_000;

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

  const requestAccountsPromise = page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const provider = (window as any).ethereum;
    if (!provider) throw new Error("window.ethereum is not available");
    return provider.request({ method: "eth_requestAccounts" }) as Promise<string[]>;
  });

  let accounts: string[];
  try {
    accounts = await Promise.race([
      requestAccountsPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("eth_requestAccounts timeout")), 20_000),
      ),
    ]);
  } catch {
    await metamask.connectToDapp();
    accounts = await requestAccountsPromise;
  }
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
  const openWalletButton = metamask.page.getByRole("button", {
    name: /Open wallet/i,
  });
  if ((await openWalletButton.count()) > 0 && (await openWalletButton.first().isVisible())) {
    await openWalletButton.first().click();
  }

  await page.goto("/login");

  const connectWalletButton = page.getByTestId("connect-wallet-button");
  await expect(connectWalletButton).toBeVisible();
  await connectWalletButton.click();

  try {
    await Promise.race([
      (async () => {
        await selectMetaMaskInAppKit(page);
        await metamask.connectToDapp();
        await metamask.confirmSignature();
        await page.waitForURL("**/dashboard", { timeout: 90_000 });
      })(),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("AppKit connect/sign flow timed out")),
          APPKIT_LOGIN_TIMEOUT_MS,
        ),
      ),
    ]);
  } catch {
    await signInViaInjectedProvider(page, metamask);
  }

  await expect(page).toHaveURL(/\/dashboard/);
}

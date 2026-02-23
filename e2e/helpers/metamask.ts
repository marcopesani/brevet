import type { MetaMask } from "@synthetixio/synpress/playwright";

export async function approveTypedDataSignature(metamask: MetaMask) {
  try {
    await metamask.approveSwitchNetwork();
  } catch {
    // No network switch request was shown.
  }

  await metamask.confirmSignature();
}

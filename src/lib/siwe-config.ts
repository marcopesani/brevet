import { getCsrfToken, getSession, signIn, signOut } from "next-auth/react";
import { createSIWEConfig, formatMessage } from "@reown/appkit-siwe";
import type {
  SIWECreateMessageArgs,
  SIWEVerifyMessageArgs,
  SIWESession,
} from "@reown/appkit-siwe";
import { getAddress } from "viem";
import { networks } from "@/lib/walletconnect";

/** Normalize address to EIP-55 checksum (recommended by Reown when not using their server lib). */
function normalizeAddress(address: string): string {
  try {
    const parts = address.split(":");
    const raw = parts[parts.length - 1];
    const checksummed = getAddress(raw);
    parts[parts.length - 1] = checksummed;
    return parts.join(":");
  } catch {
    return address;
  }
}

export async function getMessageParams() {
  return {
    domain: typeof window !== "undefined" ? window.location.host : "",
    uri: typeof window !== "undefined" ? window.location.origin : "",
    chains: networks.map((n) => n.id),
    statement: "Please sign with your account",
  };
}

export function createSiweMessage({
  address,
  ...args
}: SIWECreateMessageArgs): string {
  return formatMessage(args, normalizeAddress(address));
}

export async function fetchNonce(): Promise<string> {
  const nonce = await getCsrfToken();
  if (!nonce) throw new Error("Failed to get nonce!");
  return nonce;
}

export async function fetchSession(): Promise<SIWESession | null> {
  const session = await getSession();
  if (!session) return null;
  if (
    typeof session.address !== "string" ||
    typeof session.chainId !== "number"
  ) {
    return null;
  }
  return {
    address: session.address,
    chainId: session.chainId,
  } satisfies SIWESession;
}

/** SIWX flow calls verifyMessage(session) with { data, message, signature }; legacy SIWE uses { message, signature }. */
export async function verifySiweMessage(
  args: SIWEVerifyMessageArgs | { data?: { accountAddress?: string; chainId?: string }; message?: string; signature?: string }
): Promise<boolean> {
  const message = args.message ?? (args as { message?: string }).message;
  const signature = args.signature ?? (args as { signature?: string }).signature;
  if (!message || !signature) {
    return false;
  }
  try {
    const success = await signIn("credentials", {
      message,
      redirect: false,
      signature,
      callbackUrl: "/dashboard",
    });
    return Boolean(success?.ok);
  } catch {
    return false;
  }
}

export async function signOutSession(): Promise<boolean> {
  try {
    await signOut({ redirect: false });
    return true;
  } catch {
    return false;
  }
}

export const siweConfig = createSIWEConfig({
  getMessageParams,
  createMessage: createSiweMessage,
  getNonce: fetchNonce,
  getSession: fetchSession,
  verifyMessage: verifySiweMessage,
  signOut: signOutSession,
  async onSignIn() {
    if (typeof window === "undefined") return;
    const s = await getSession();
    if (s?.address) {
      window.location.href = "/dashboard";
    }
  },
});

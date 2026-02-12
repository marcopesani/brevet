import type { Hex } from "viem";
import { formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { prisma } from "@/lib/db";
import { decryptPrivateKey, USDC_DECIMALS } from "@/lib/hot-wallet";
import { checkPolicy } from "@/lib/policy";
import {
  buildTransferAuthorization,
  signTransferAuthorization,
} from "./eip712";
import {
  parsePaymentRequired,
  buildPaymentSignatureHeader,
  extractTxHashFromResponse,
} from "./headers";
import type { PaymentResult, PaymentRequirement, SigningStrategy } from "./types";

/**
 * Execute the full x402 payment flow for a given URL.
 *
 * 1. Fetch the URL
 * 2. If 402 → parse payment requirements
 * 3. Check spending policy
 * 4. Sign EIP-712 TransferWithAuthorization with hot wallet
 * 5. Re-request with PAYMENT-SIGNATURE header
 * 6. Log transaction to database
 *
 * @param url    The x402-protected endpoint
 * @param userId The user whose hot wallet and policy to use
 */
/**
 * Validate a URL before making an HTTP request.
 * Rejects non-http(s) protocols, private/internal IPs, and malformed URLs.
 */
function validateUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "Invalid URL format";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return `Unsupported protocol: ${parsed.protocol} (only http and https are allowed)`;
  }

  const hostname = parsed.hostname;

  // Reject localhost and loopback
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname === "0.0.0.0"
  ) {
    return "Requests to localhost/loopback addresses are not allowed";
  }

  // Reject private IPv4 ranges
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (
      a === 10 ||                          // 10.0.0.0/8
      (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
      (a === 192 && b === 168) ||           // 192.168.0.0/16
      a === 169 && b === 254               // 169.254.0.0/16 (link-local)
    ) {
      return "Requests to private/internal IP addresses are not allowed";
    }
  }

  // Reject common internal hostnames
  if (
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".localhost")
  ) {
    return "Requests to internal hostnames are not allowed";
  }

  return null;
}

export async function executePayment(
  url: string,
  userId: string,
): Promise<PaymentResult> {
  // Step 0: Validate URL
  const urlError = validateUrl(url);
  if (urlError) {
    return { success: false, status: "rejected", signingStrategy: "rejected", error: `URL validation failed: ${urlError}` };
  }

  // Step 1: Initial request
  const initialResponse = await fetch(url);

  if (initialResponse.status !== 402) {
    // Not a paid endpoint — return the response as-is
    return { success: true, status: "completed", signingStrategy: "hot_wallet", response: initialResponse };
  }

  // Step 2: Parse payment requirements
  const requirements = parsePaymentRequired(initialResponse);
  if (!requirements || requirements.length === 0) {
    return {
      success: false,
      status: "rejected",
      signingStrategy: "rejected",
      error: "Received 402 but no valid payment requirements in headers",
    };
  }

  // Use the first requirement that matches our supported scheme/network
  const requirement = requirements.find(
    (r): r is PaymentRequirement =>
      r.scheme === "exact" && r.network === "eip155:8453",
  );

  if (!requirement) {
    return {
      success: false,
      status: "rejected",
      signingStrategy: "rejected",
      error:
        "No supported payment requirement found (need scheme=exact, network=eip155:8453)",
    };
  }

  // Step 3: Look up the user's hot wallet
  const hotWallet = await prisma.hotWallet.findUnique({
    where: { userId },
  });

  if (!hotWallet) {
    return { success: false, status: "rejected", signingStrategy: "rejected", error: "No hot wallet found for user" };
  }

  const privateKey = decryptPrivateKey(hotWallet.encryptedPrivateKey) as Hex;
  const account = privateKeyToAccount(privateKey);

  // Calculate amount in human-readable USD for policy check
  const amountWei = BigInt(requirement.maxAmountRequired);
  const amountUsd = parseFloat(formatUnits(amountWei, USDC_DECIMALS));

  // Step 4: Check spending policy
  const policyResult = await checkPolicy(amountUsd, url, userId);
  if (!policyResult.allowed) {
    return {
      success: false,
      status: "rejected",
      signingStrategy: "rejected",
      error: `Policy denied: ${policyResult.reason}`,
    };
  }

  // Step 5: Determine signing strategy based on amount vs policy limits
  const perRequestLimit = policyResult.perRequestLimit ?? 0;
  const signingStrategy: SigningStrategy =
    amountUsd <= perRequestLimit ? "hot_wallet" : "walletconnect";

  // If the amount exceeds the hot wallet limit, return pending_approval
  // for the client to sign via WalletConnect
  if (signingStrategy === "walletconnect") {
    return {
      success: false,
      status: "pending_approval",
      signingStrategy: "walletconnect",
      paymentRequirements: JSON.stringify([requirement]),
      amount: amountUsd,
    };
  }

  // Step 6: Hot wallet auto-sign — build and sign the EIP-712 message
  const authorization = buildTransferAuthorization(
    account.address,
    requirement.payTo,
    amountWei,
  );

  const signature = await signTransferAuthorization(authorization, privateKey);
  const paymentHeader = buildPaymentSignatureHeader(signature, authorization);

  // Step 7: Re-request with payment header
  const paidResponse = await fetch(url, {
    headers: {
      "PAYMENT-SIGNATURE": paymentHeader,
    },
  });

  // Step 8: Extract transaction hash from facilitator response
  const txHash = await extractTxHashFromResponse(paidResponse);

  // Step 9: Log transaction
  const txStatus = paidResponse.ok ? "completed" : "failed";
  await prisma.transaction.create({
    data: {
      amount: amountUsd,
      endpoint: url,
      txHash,
      network: "base",
      status: txStatus,
      type: "payment",
      userId,
    },
  });

  if (!paidResponse.ok) {
    return {
      success: false,
      status: "rejected",
      signingStrategy: "hot_wallet",
      error: `Payment submitted but server responded with ${paidResponse.status}`,
      response: paidResponse,
    };
  }

  return { success: true, status: "completed", signingStrategy: "hot_wallet", response: paidResponse };
}

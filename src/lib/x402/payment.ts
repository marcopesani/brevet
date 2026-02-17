import { createWalletClient, PrivateKeyAccount, WalletClient, type Hex } from "viem";
import { formatUnits } from "viem";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { createTransaction } from "@/lib/data/transactions";
import { getHotWallet } from "@/lib/data/wallet";
import { decryptPrivateKey, getUsdcBalance, USDC_DECIMALS } from "@/lib/hot-wallet";
import { checkPolicy } from "@/lib/policy";
import { createEvmSigner } from "./eip712";
import { parsePaymentRequired, extractTxHashFromResponse, extractSettleResponse } from "./headers";
import type { ClientEvmSigner,
PaymentResult, SigningStrategy } from "./types";
import { chainConfig } from "../chain-config";
import { logger } from "../logger";
import { SIWxExtension } from "@x402/extensions";
import { createSIWxPayload,
encodeSIWxHeader } from "@x402/extensions/sign-in-with-x";
import { privateKeyToAccount } from "viem/accounts";
import { http } from "wagmi";

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

/**
 * Create an x402Client configured with EVM schemes for a given private key.
 *
 * Registers both V1 and V2 EVM exact schemes (EIP-3009 + Permit2)
 * via `registerExactEvmScheme` which handles wildcard eip155:* matching.
 */
function createPaymentClient(privateKey: Hex): { client: x402Client; httpClient: x402HTTPClient; account: PrivateKeyAccount } {
  const account = privateKeyToAccount(privateKey);
 
  const signer = createEvmSigner(privateKey);
  
  const client = new x402Client();
  registerExactEvmScheme(client, { signer });
  const httpClient = new x402HTTPClient(client);
  return { client, httpClient, account };
}

/**
 * Options for the HTTP request sent during the x402 payment flow.
 */
export interface PaymentRequestOptions {
  /** HTTP method (defaults to "GET"). */
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  /** Request body (for POST/PUT/PATCH). Sent as-is on both the initial and paid requests. */
  body?: string;
  /** Additional HTTP headers. Merged into both the initial and paid requests. */
  headers?: Record<string, string>;
}

/**
 * Execute the full x402 payment flow for a given URL.
 *
 * 1. Fetch the URL (using the specified method, body, and headers)
 * 2. If 402 → parse payment requirements (V1 or V2 via SDK)
 * 3. Check spending policy
 * 4. Create payment payload via SDK (handles EIP-3009 + Permit2)
 * 5. Re-request with payment headers (preserving original method/body/headers)
 * 6. Log transaction to database
 *
 * @param url     The x402-protected endpoint
 * @param userId  The user whose hot wallet and policy to use
 * @param options Optional HTTP method, body, and headers for the request
 */
export async function executePayment(
  url: string,
  userId: string,
  options?: PaymentRequestOptions,
): Promise<PaymentResult> {
  // Step 0: Validate URL
  const urlError = validateUrl(url);
  if (urlError) {
    logger.warn("URL validation failed", { userId, url, action: "payment_rejected", error: urlError });
    return { success: false, status: "rejected", signingStrategy: "rejected", error: `URL validation failed: ${urlError}` };
  }

  // Step 1: Initial request (preserving caller's method, body, and headers)
  const method = options?.method ?? "GET";
  const requestInit: RequestInit = { method };
  if (options?.body) {
    requestInit.body = options.body;
  }
  if (options?.headers) {
    requestInit.headers = { ...options.headers };
  }
  const initialResponse = await fetch(url, requestInit);

  if (initialResponse.status !== 402) {
    // Not a paid endpoint — return the response as-is
    logger.info("Non-402 response, returning directly", { userId, url, action: "payment_passthrough", status: initialResponse.status });
    return { success: true, status: "completed", signingStrategy: "hot_wallet", response: initialResponse };
  }

  // Step 2: Parse payment requirements (SDK handles V1 body + V2 header)
  let responseBody: unknown;
  try {
    const responseText = await initialResponse.clone().text();
    if (responseText) {
      responseBody = JSON.parse(responseText);
    }
  } catch {
    // Not valid JSON — that's fine, V2 uses headers only
  }


  const paymentRequired = parsePaymentRequired(initialResponse, responseBody);
  if (!paymentRequired || !paymentRequired.accepts || paymentRequired.accepts.length === 0) {
    logger.warn("No payment requirements in 402 response", { userId, url, action: "payment_rejected" });
    return {
      success: false,
      status: "rejected",
      signingStrategy: "rejected",
      error: "Received 402 but no valid payment requirements found",
    };
  }

  if (!paymentRequired.accepts.some(accept => accept.network === chainConfig.networkString)) {
    return {
      success: false,
      status: "rejected",
      signingStrategy: "rejected",
      error: `Network ${chainConfig.networkString} is not supported`,
    };
  }

  // Step 3: Look up the user's hot wallet
  const hotWallet = await getHotWallet(userId);

  if (!hotWallet) {
    return { success: false, status: "rejected", signingStrategy: "rejected", error: "No hot wallet found for user" };
  }

  const privateKey = decryptPrivateKey(hotWallet.encryptedPrivateKey) as Hex;

  // Step 4: Determine the amount from the first accepted requirement
  // SDK V2 uses `amount`, V1 uses `maxAmountRequired` — check both
  const selectedRequirement = paymentRequired.accepts[0];
  const amountStr = selectedRequirement.amount
    ?? (selectedRequirement as unknown as { maxAmountRequired?: string }).maxAmountRequired
    ?? "0";
  const amountWei = BigInt(amountStr);
  const amountUsd = parseFloat(formatUnits(amountWei, USDC_DECIMALS));

  // Step 5: Check spending policy (returns action: hot_wallet | walletconnect | rejected)
  const policyResult = await checkPolicy(amountUsd, url, userId);
  if (policyResult.action === "rejected") {
    logger.warn("Policy denied payment", { userId, url, action: "policy_denied", reason: policyResult.reason, amount: amountUsd });
    return {
      success: false,
      status: "rejected",
      signingStrategy: "rejected",
      error: `Policy denied: ${policyResult.reason}`,
    };
  }

  // Step 6: Determine signing strategy
  let signingStrategy: SigningStrategy = policyResult.action;

  // If the policy says hot_wallet, verify the on-chain USDC balance is sufficient.
  // If balance is too low, fall through to the WalletConnect path instead of failing.
  if (signingStrategy === "hot_wallet") {
    const balanceStr = await getUsdcBalance(hotWallet.address);
    const balance = parseFloat(balanceStr);
    if (balance < amountUsd) {
      logger.info("Insufficient hot wallet balance, falling back to WalletConnect", { userId, url, action: "walletconnect_fallback", amount: amountUsd });
      signingStrategy = "walletconnect";
    }
  }

  // WalletConnect path: return pending_approval for client-side signing
  if (signingStrategy === "walletconnect") {
    logger.info("Payment requires wallet approval", { userId, url, action: "pending_approval", amount: amountUsd });
    return {
      success: false,
      status: "pending_approval",
      signingStrategy: "walletconnect",
      paymentRequirements: JSON.stringify(paymentRequired.accepts),
      amount: amountUsd,
    };
  }

  // Step 7: Create payment payload via SDK (handles EIP-3009 + Permit2)
  const { client, httpClient, account } = createPaymentClient(privateKey);
  let paymentPayload;
  try {
    paymentPayload = await client.createPaymentPayload(paymentRequired);
  } catch (err) {
    return {
      success: false,
      status: "rejected",
      signingStrategy: "hot_wallet",
      error: `Failed to create payment: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }


  // opt in SIVX support
  const siwxExtension = paymentRequired.extensions?.['sign-in-with-x'] as SIWxExtension | undefined;
  let signInWithXHeader: string | undefined;
  if (siwxExtension) {
    const matchingChain = siwxExtension?.supportedChains?.find(
      (chain: { chainId: string }) => chain.chainId === chainConfig.networkString
    );
  
    if (!matchingChain) {
      return {
        success: false,
        status: "rejected",
        signingStrategy: "rejected",
        error: `SIVX failed: chain ${chainConfig.networkString} not supported by server`,
      };
    }
  
    // Build complete info with selected chain
    const completeInfo = {
      ...siwxExtension.info,
      chainId: matchingChain.chainId,
      type: matchingChain.type,
    };
  
    // Create signed payload
    const payload = await createSIWxPayload(completeInfo, account);
    signInWithXHeader = encodeSIWxHeader(payload);
  }

  // Step 8: Encode payment into HTTP headers and re-request (preserving original method/body/headers)
  const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);
  const paidRequestInit: RequestInit = {
    method,
    headers: {
      ...options?.headers,
      ...paymentHeaders,
      ...(signInWithXHeader ? { 'SIGN-IN-WITH-X': signInWithXHeader } : {}),
    },
  };
  if (options?.body) {
    paidRequestInit.body = options.body;
  }
  const paidResponse = await fetch(url, paidRequestInit);

  // Read response body for storage (without consuming the original response)
  let responsePayload: string | null = null;
  try {
    responsePayload = await paidResponse.clone().text();
  } catch {
    // If reading fails, leave as null — don't break the payment flow
  }

  // Step 9: Extract settlement response and transaction hash from facilitator response
  const settlement = extractSettleResponse(paidResponse) ?? undefined;
  const txHash = settlement?.transaction ?? await extractTxHashFromResponse(paidResponse);

  // Step 10: Log transaction
  const txStatus = paidResponse.ok ? "completed" : "failed";
  await createTransaction({
    amount: amountUsd,
    endpoint: url,
    txHash,
    network: selectedRequirement.network,
    status: txStatus,
    type: "payment",
    userId,
    responsePayload,
    errorMessage: !paidResponse.ok ? `Payment submitted but server responded with ${paidResponse.status}` : undefined,
    responseStatus: paidResponse.status,
  });

  if (!paidResponse.ok) {
    logger.error("Payment failed", { userId, url, action: "payment_failed", status: paidResponse.status, amount: amountUsd });
    return {
      success: false,
      status: "rejected",
      signingStrategy: "hot_wallet",
      error: `Payment submitted but server responded with ${paidResponse.status}`,
      response: paidResponse,
    };
  }

  logger.info("Payment completed successfully", { userId, url, action: "payment_completed", txHash, amount: amountUsd, status: paidResponse.status });
  return { success: true, status: "completed", signingStrategy: "hot_wallet", response: paidResponse, settlement };
}

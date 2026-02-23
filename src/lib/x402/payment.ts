import { type Hex } from "viem";
import { formatUnits } from "viem";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { createTransaction } from "@/lib/data/transactions";
import { getSmartAccount, getSmartAccountWithSessionKey, updateSessionKeyStatus } from "@/lib/data/smart-account";
import { decryptPrivateKey, getUsdcBalance } from "@/lib/hot-wallet";
import { checkPolicy } from "@/lib/policy";
import { createSmartAccountSignerFromSerialized, createSmartAccountSigner } from "@/lib/smart-account";
import { SESSION_KEY_DEFAULT_EXPIRY_DAYS } from "@/lib/smart-account-constants";
import { parsePaymentRequired, extractTxHashFromResponse, extractSettleResponse } from "./headers";
import { getRequirementAmount } from "./requirements";
import type {
PaymentResult, SigningStrategy, ClientEvmSigner } from "./types";
import { getChainById, getUsdcConfig, isChainSupported, getAllChains } from "../chain-config";
import { getUserEnabledChains, isChainEnabledForUser } from "../data/user";
import { logger } from "../logger";
import { validateUrl, safeFetch } from "../safe-fetch";
import { SIWxExtension } from "@x402/extensions";

/**
 * Create an x402Client configured with EVM schemes for a given signer.
 *
 * Registers both V1 and V2 EVM exact schemes (EIP-3009 + Permit2)
 * via `registerExactEvmScheme` which handles wildcard eip155:* matching.
 */
function createPaymentClient(signer: ClientEvmSigner): { client: x402Client; httpClient: x402HTTPClient } {
  const client = new x402Client();
  registerExactEvmScheme(client, { signer });
  const httpClient = new x402HTTPClient(client);
  return { client, httpClient };
}

/**
 * Resolve a network string to a chain ID.
 * Supports both EIP-155 format ("eip155:42161") and the networkString values
 * in the chain registry. Also matches against chain slugs from the registry
 * for V1 SDK compatibility (e.g., "base-sepolia").
 */
function resolveNetworkToChainId(network: string): number | undefined {
  // Try EIP-155 format first
  const match = network.match(/^eip155:(\d+)$/);
  if (match) {
    const chainId = parseInt(match[1], 10);
    return isChainSupported(chainId) ? chainId : undefined;
  }

  // Fall back to matching against registry networkString, slug, or aliases
  const lower = network.toLowerCase();
  for (const config of getAllChains()) {
    if (config.networkString === network) return config.chain.id;
    if (config.slug === lower) return config.chain.id;
    if (config.aliases.some((a) => a.toLowerCase() === lower)) return config.chain.id;
  }
  return undefined;
}

/**
 * Select the best chain from the endpoint's accepted networks.
 *
 * Strategy for smart account:
 * 1. Filter to chains we support
 * 2. For each supported chain, check if user has a smart account with active session key
 * 3. Pick the chain with the highest USDC balance (among active session key accounts)
 *
 * Returns the selected chainId and the matching accept entry index,
 * or null if no supported chain is found.
 */
async function selectBestChain(
  accepts: Array<{ network: string; [key: string]: unknown }>,
  userId: string,
): Promise<{ chainId: number; acceptIndex: number } | null> {
  // Build list of supported chains from the accepts array, filtered to user's enabled chains
  const enabledChains = await getUserEnabledChains(userId);
  const candidates: Array<{ chainId: number; acceptIndex: number }> = [];
  for (let i = 0; i < accepts.length; i++) {
    const resolvedChainId = resolveNetworkToChainId(accepts[i].network);
    if (resolvedChainId !== undefined && enabledChains.includes(resolvedChainId)) {
      candidates.push({ chainId: resolvedChainId, acceptIndex: i });
    }
  }

  if (candidates.length === 0) return null;

  // Try to find the best chain where user has a smart account with active session key and highest balance
  let bestCandidate: { chainId: number; acceptIndex: number } | null = null;
  let bestBalance = -1;

  for (const candidate of candidates) {
    const account = await getSmartAccount(userId, candidate.chainId);
    if (!account || account.sessionKeyStatus !== "active") continue;

    try {
      const balanceStr = await getUsdcBalance(account.smartAccountAddress, candidate.chainId);
      const balance = parseFloat(balanceStr);
      if (balance > bestBalance) {
        bestBalance = balance;
        bestCandidate = candidate;
      }
    } catch {
      // RPC error for this chain — skip it
      continue;
    }
  }

  // If we found a chain with an active smart account, use it
  if (bestCandidate) return bestCandidate;

  // No active smart account on any supported chain — return first supported chain
  // (will trigger manual approval flow downstream)
  return candidates[0];
}

/**
 * Security-sensitive headers that must never be overridden by MCP tool callers.
 * Compared case-insensitively against user-supplied header names.
 */
const BLOCKED_HEADERS = new Set([
  "host",
  "authorization",
  "cookie",
  "set-cookie",
  "transfer-encoding",
  "content-length",
  "connection",
  "x-payment",
  "payment-signature",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-real-ip",
  "origin",
  "referer",
]);

/**
 * Sanitize user-supplied headers: remove blocked headers and strip CRLF from values.
 */
export function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (BLOCKED_HEADERS.has(key.toLowerCase())) continue;
    // Strip CRLF characters to prevent header injection
    sanitized[key] = value.replace(/[\r\n]/g, "");
  }
  return sanitized;
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
 * 3. Select best chain from accepted networks
 * 4. Check spending policy
 * 5. Create payment payload via SDK (handles EIP-3009 + Permit2)
 * 6. Re-request with payment headers (preserving original method/body/headers)
 * 7. Log transaction to database
 *
 * @param url     The x402-protected endpoint
 * @param userId  The user whose smart account and policy to use
 * @param options Optional HTTP method, body, and headers for the request
 * @param chainId Optional explicit chain ID — skips auto-selection if provided
 */
export async function executePayment(
  url: string,
  userId: string,
  options?: PaymentRequestOptions,
  chainId?: number,
): Promise<PaymentResult> {
  // Step 0: Validate URL
  const urlError = validateUrl(url);
  if (urlError) {
    logger.warn("URL validation failed", { userId, url, action: "payment_rejected", error: urlError });
    return { success: false, status: "rejected", signingStrategy: "rejected", error: `URL validation failed: ${urlError}` };
  }

  // Step 1: Initial request (preserving caller's method, body, and sanitized headers)
  const method = options?.method ?? "GET";
  const safeHeaders = options?.headers ? sanitizeHeaders(options.headers) : undefined;
  const requestInit: RequestInit = { method };
  if (options?.body) {
    requestInit.body = options.body;
  }
  if (safeHeaders) {
    requestInit.headers = { ...safeHeaders };
  }
  let initialResponse: Response;
  try {
    initialResponse = await safeFetch(url, requestInit);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fetch failed";
    logger.warn("Initial request failed", { userId, url, action: "payment_rejected", error: message });
    return { success: false, status: "rejected", signingStrategy: "rejected", error: `Request failed: ${message}` };
  }

  if (initialResponse.status !== 402) {
    // Not a paid endpoint — return the response as-is
    logger.info("Non-402 response, returning directly", { userId, url, action: "payment_passthrough", status: initialResponse.status });
    return { success: true, status: "completed", signingStrategy: "auto_sign", response: initialResponse };
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

  // Step 3: Select chain from accepted networks
  let selectedChainId: number;
  let acceptIndex: number;

  if (chainId !== undefined) {
    // Explicit chain requested — validate it's supported, enabled, and accepted
    const config = getChainById(chainId);
    if (!config) {
      return {
        success: false,
        status: "rejected",
        signingStrategy: "rejected",
        error: `Chain ${chainId} is not supported`,
      };
    }
    const chainEnabled = await isChainEnabledForUser(userId, chainId);
    if (!chainEnabled) {
      return {
        success: false,
        status: "rejected",
        signingStrategy: "rejected",
        error: `Chain ${config.displayName} (${chainId}) is not enabled for your account. Enable it in Settings.`,
      };
    }
    const idx = paymentRequired.accepts.findIndex(a => a.network === config.networkString);
    if (idx === -1) {
      return {
        success: false,
        status: "rejected",
        signingStrategy: "rejected",
        error: `Chain ${chainId} (${config.networkString}) is not accepted by this endpoint`,
      };
    }
    selectedChainId = chainId;
    acceptIndex = idx;
  } else {
    // Auto-select best chain
    const selection = await selectBestChain(paymentRequired.accepts, userId);
    if (!selection) {
      return {
        success: false,
        status: "rejected",
        signingStrategy: "rejected",
        error: `None of the endpoint's accepted networks are supported or enabled for your account`,
      };
    }
    selectedChainId = selection.chainId;
    acceptIndex = selection.acceptIndex;
  }

  // Step 4: Look up the user's smart account for the selected chain (with session key for signing)
  const smartAccount = await getSmartAccountWithSessionKey(userId, selectedChainId);

  // Step 5: Determine the amount from the selected requirement (V1 or V2 via library helper)
  const selectedRequirement = paymentRequired.accepts[acceptIndex];
  const amountStr = getRequirementAmount(selectedRequirement) ?? "0";
  const amountWei = BigInt(amountStr);
  const usdcConfig = getUsdcConfig(selectedChainId);
  const usdcDecimals = usdcConfig?.decimals ?? 6;
  const amountUsd = parseFloat(formatUnits(amountWei, usdcDecimals));

  // Check session key expiry before signing
  if (smartAccount && smartAccount.sessionKeyStatus === "active" && smartAccount.sessionKeyExpiry) {
    const expiryDate = new Date(smartAccount.sessionKeyExpiry);
    if (expiryDate < new Date()) {
      await updateSessionKeyStatus(userId, selectedChainId, "expired");
      logger.info("Session key expired, requires re-authorization", { userId, url, action: "session_key_expired", chainId: selectedChainId });
      return {
        success: false,
        status: "rejected",
        signingStrategy: "auto_sign",
        error: "Session key has expired. Please re-authorize in the dashboard.",
      };
    }
  }

  // If no smart account on this chain OR session key not active → fall back to manual approval
  if (!smartAccount || smartAccount.sessionKeyStatus !== "active") {
    const reason = !smartAccount ? "No smart account on selected chain" : "Session key not active";
    logger.info(`${reason}, requires manual approval`, { userId, url, action: "pending_approval", chainId: selectedChainId, amount: amountUsd });
    return {
      success: false,
      status: "pending_approval",
      signingStrategy: "manual_approval",
      paymentRequirements: JSON.stringify(paymentRequired),
      amountRaw: getRequirementAmount(selectedRequirement) ?? "",
      asset: selectedRequirement.asset,
      chainId: selectedChainId,
      maxTimeoutSeconds: selectedRequirement.maxTimeoutSeconds,
    };
  }

  // Step 6: Check spending policy (returns action: auto_sign | manual_approval | rejected)
  const policyResult = await checkPolicy(amountUsd, url, userId, selectedChainId);
  if (policyResult.action === "rejected") {
    logger.warn("Policy denied payment", { userId, url, action: "policy_denied", reason: policyResult.reason, amount: amountUsd, chainId: selectedChainId });
    return {
      success: false,
      status: "rejected",
      signingStrategy: "rejected",
      error: `Policy denied: ${policyResult.reason}`,
    };
  }

  // Step 7: Determine signing strategy
  let signingStrategy: SigningStrategy = policyResult.action;

  // If the policy says auto_sign, verify the on-chain USDC balance is sufficient.
  // If balance is too low, fall through to the manual approval path instead of failing.
  if (signingStrategy === "auto_sign") {
    const balanceStr = await getUsdcBalance(smartAccount.smartAccountAddress, selectedChainId);
    const balance = parseFloat(balanceStr);
    if (balance < amountUsd) {
      logger.info("Insufficient smart account balance, falling back to manual approval", { userId, url, action: "manual_approval_fallback", amount: amountUsd, chainId: selectedChainId });
      signingStrategy = "manual_approval";
    }
  }

  // Manual approval path: return pending_approval for caller to create PendingPayment
  if (signingStrategy === "manual_approval") {
    logger.info("Payment requires manual approval", { userId, url, action: "pending_approval", amount: amountUsd, chainId: selectedChainId });
    return {
      success: false,
      status: "pending_approval",
      signingStrategy: "manual_approval",
      paymentRequirements: JSON.stringify(paymentRequired),
      amountRaw: getRequirementAmount(selectedRequirement) ?? "",
      asset: selectedRequirement.asset,
      chainId: selectedChainId,
      maxTimeoutSeconds: selectedRequirement.maxTimeoutSeconds,
    };
  }

  // Step 8: Create smart account signer and payment payload via SDK
  const sessionKeyHex = decryptPrivateKey(smartAccount.sessionKeyEncrypted) as Hex;
  let signer: ClientEvmSigner;
  try {
    if (smartAccount.serializedAccount) {
      // Fast path: deserialize previously-serialized permission account
      const serialized = decryptPrivateKey(smartAccount.serializedAccount);
      signer = await createSmartAccountSignerFromSerialized(
        serialized,
        sessionKeyHex,
        selectedChainId,
      );
    } else {
      // Full path: reconstruct from session key
      const expiryTs = smartAccount.sessionKeyExpiry
        ? Math.floor(new Date(smartAccount.sessionKeyExpiry).getTime() / 1000)
        : Math.floor(Date.now() / 1000 + SESSION_KEY_DEFAULT_EXPIRY_DAYS * 24 * 60 * 60);
      const spendLimitPerTx = smartAccount.spendLimitPerTx !== undefined
        ? BigInt(smartAccount.spendLimitPerTx)
        : undefined;
      signer = await createSmartAccountSigner(
        sessionKeyHex,
        smartAccount.smartAccountAddress as `0x${string}`,
        selectedChainId,
        expiryTs,
        spendLimitPerTx,
      );
    }
  } catch (err) {
    return {
      success: false,
      status: "rejected",
      signingStrategy: "auto_sign",
      error: `Failed to create smart account signer: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }

  const { client, httpClient } = createPaymentClient(signer);
  let paymentPayload;
  try {
    paymentPayload = await client.createPaymentPayload(paymentRequired);
  } catch (err) {
    return {
      success: false,
      status: "rejected",
      signingStrategy: "auto_sign",
      error: `Failed to create payment: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }

  // opt in SIVX support
  const siwxExtension = paymentRequired.extensions?.['sign-in-with-x'] as SIWxExtension | undefined;
  let signInWithXHeader: string | undefined;
  if (siwxExtension) {
    // Smart account signers use ERC-1271 (contract signatures), which are incompatible
    // with SIWx's personal_sign requirement. Reject early with a clear error.
    return {
      success: false,
      status: "rejected",
      signingStrategy: "rejected",
      error: "SIWx is not supported with smart account signers (ERC-1271). Use an EOA wallet for SIWx-enabled endpoints.",
    };
  }

  // Step 9: Encode payment into HTTP headers and re-request (preserving original method/body/headers)
  const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);
  const paidRequestInit: RequestInit = {
    method,
    headers: {
      ...safeHeaders,
      ...paymentHeaders,
      ...(signInWithXHeader ? { 'SIGN-IN-WITH-X': signInWithXHeader } : {}),
    },
  };
  if (options?.body) {
    paidRequestInit.body = options.body;
  }
  let paidResponse: Response;
  try {
    paidResponse = await safeFetch(url, paidRequestInit);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fetch failed";
    logger.error("Paid request failed", { userId, url, action: "payment_failed", error: message });
    return { success: false, status: "rejected", signingStrategy: "auto_sign", error: `Paid request failed: ${message}` };
  }

  // Read response body for storage (without consuming the original response)
  let responsePayload: string | null = null;
  try {
    responsePayload = await paidResponse.clone().text();
  } catch {
    // If reading fails, leave as null — don't break the payment flow
  }

  // Step 10: Extract settlement response and transaction hash from facilitator response
  const settlement = extractSettleResponse(paidResponse) ?? undefined;
  const txHash = settlement?.transaction ?? await extractTxHashFromResponse(paidResponse);

  // Step 11: Log transaction with chainId
  const txStatus = paidResponse.ok ? "completed" : "failed";
  await createTransaction({
    amount: amountUsd,
    endpoint: url,
    txHash,
    network: selectedRequirement.network,
    chainId: selectedChainId,
    status: txStatus,
    type: "payment",
    userId,
    responsePayload,
    errorMessage: !paidResponse.ok ? `Payment submitted but server responded with ${paidResponse.status}` : undefined,
    responseStatus: paidResponse.status,
  });

  if (!paidResponse.ok) {
    logger.error("Payment failed", { userId, url, action: "payment_failed", status: paidResponse.status, amount: amountUsd, chainId: selectedChainId, responseBody: responsePayload?.slice(0, 500) });
    return {
      success: false,
      status: "rejected",
      signingStrategy: "auto_sign",
      error: `Payment submitted but server responded with ${paidResponse.status}`,
      response: paidResponse,
    };
  }

  logger.info("Payment completed successfully", { userId, url, action: "payment_completed", txHash, amount: amountUsd, chainId: selectedChainId, status: paidResponse.status });
  return { success: true, status: "completed", signingStrategy: "auto_sign", response: paidResponse, settlement };
}

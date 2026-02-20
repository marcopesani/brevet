import { type Hex } from "viem";
import { formatUnits } from "viem";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { createTransaction } from "@/lib/data/transactions";
import { getSmartAccount, getSmartAccountWithSessionKey } from "@/lib/data/smart-account";
import { decryptPrivateKey, getUsdcBalance, USDC_DECIMALS } from "@/lib/hot-wallet";
import { checkPolicy } from "@/lib/policy";
import { createSmartAccountSignerFromSerialized, createSmartAccountSigner } from "@/lib/smart-account";
import { parsePaymentRequired, extractTxHashFromResponse, extractSettleResponse } from "./headers";
import type {
PaymentResult, SigningStrategy, ClientEvmSigner } from "./types";
import { getChainConfig, isChainSupported, SUPPORTED_CHAINS } from "../chain-config";
import { logger } from "../logger";
import { SIWxExtension } from "@x402/extensions";
import { createSIWxPayload,
encodeSIWxHeader } from "@x402/extensions/sign-in-with-x";

/**
 * Check if an IPv4 address (given as four octets) is private, loopback, or internal.
 */
function isPrivateIpv4(a: number, b: number): boolean {
  return (
    a === 127 ||                         // 127.0.0.0/8 (loopback)
    a === 10 ||                          // 10.0.0.0/8
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) ||          // 192.168.0.0/16
    (a === 169 && b === 254) ||          // 169.254.0.0/16 (link-local)
    a === 0                              // 0.0.0.0/8
  );
}

/**
 * Check an IPv6 hostname for dangerous addresses: loopback (::1), unspecified (::),
 * link-local (fe80::/10), and IPv6-mapped IPv4 (::ffff:x.x.x.x) that embed private IPs.
 * Returns an error string if blocked, or null if safe.
 *
 * Note: Node's URL parser may keep brackets on IPv6 hostnames (e.g., "[::1]") and
 * normalizes dotted IPv4-mapped addresses to hex form (e.g., ::ffff:127.0.0.1 → ::ffff:7f00:1).
 */
function checkIpv6Address(hostname: string): string | null {
  // Only process if it looks like an IPv6 address (may have brackets from URL parser)
  if (!hostname.includes(":")) return null;

  // Strip brackets if present (URL parser keeps them on IPv6 hostnames)
  const bare = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  const lower = bare.toLowerCase();

  // Loopback ::1
  if (lower === "::1") {
    return "Requests to localhost/loopback addresses are not allowed";
  }

  // Unspecified address ::
  if (lower === "::") {
    return "Requests to unspecified addresses are not allowed";
  }

  // Link-local fe80::/10
  if (lower.startsWith("fe80:") || lower.startsWith("fe80%")) {
    return "Requests to link-local IPv6 addresses are not allowed";
  }

  // IPv6-mapped IPv4: ::ffff:a.b.c.d (dotted form — may appear in user input or raw URLs)
  const mappedDottedMatch = lower.match(/^::ffff:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (mappedDottedMatch) {
    const [, a, b] = mappedDottedMatch.map(Number);
    if (isPrivateIpv4(a, b)) {
      return "Requests to private/internal IP addresses are not allowed";
    }
  }

  // IPv6-mapped IPv4 in hex form: ::ffff:7f00:1 (Node's URL parser normalizes to this)
  const mappedHexMatch = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHexMatch) {
    const hi = parseInt(mappedHexMatch[1], 16);
    const lo = parseInt(mappedHexMatch[2], 16);
    const a = (hi >> 8) & 0xff;
    const b = hi & 0xff;
    if (isPrivateIpv4(a, b)) {
      return "Requests to private/internal IP addresses are not allowed";
    }
    // Also check if the full IP resolves to 0.0.0.0
    if (hi === 0 && lo === 0) {
      return "Requests to private/internal IP addresses are not allowed";
    }
  }

  return null;
}

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
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname === "0.0.0.0"
  ) {
    return "Requests to localhost/loopback addresses are not allowed";
  }

  // Reject private/internal IPv4 ranges (includes full 127.0.0.0/8 loopback)
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (isPrivateIpv4(a, b)) {
      return "Requests to private/internal IP addresses are not allowed";
    }
  }

  // Reject IPv6 addresses that map to private/loopback IPv4 (H1)
  // URL parser may keep brackets on IPv6 hostnames — checkIpv6Address handles both forms
  const ipv6Error = checkIpv6Address(hostname);
  if (ipv6Error) {
    return ipv6Error;
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
 * Maximum number of redirects to follow before aborting.
 * Prevents infinite redirect loops and limits redirect-chain SSRF attacks.
 */
const MAX_REDIRECTS = 5;

/**
 * Fetch a URL with redirect: "manual" and validate each redirect Location
 * through validateUrl() before following it. This prevents redirect-based SSRF
 * where an external URL (e.g., https://evil.com) redirects to an internal IP
 * (e.g., http://169.254.169.254/). Limits redirect depth to MAX_REDIRECTS.
 *
 * NOTE: Production deployments should also use DNS-level rebinding protection
 * (e.g., Cloudflare Gateway, dnsmasq rebind-protection) to defend against DNS
 * rebinding attacks where a domain alternates between public and private IPs (M1).
 */
/** Timeout for outbound fetch calls in the payment flow (M8). */
const FETCH_TIMEOUT_MS = 30_000;

async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  let currentUrl = url;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const response = await fetch(currentUrl, {
      ...init,
      redirect: "manual",
      signal: init?.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    // If not a redirect, return the response as-is
    if (response.status < 300 || response.status >= 400) {
      return response;
    }

    // Handle redirect
    const location = response.headers.get("location");
    if (!location) {
      return response; // No Location header — return the redirect response
    }

    // Resolve relative redirect URLs against the current URL
    const resolvedUrl = new URL(location, currentUrl).toString();

    // Validate the redirect target for SSRF (H3)
    const redirectError = validateUrl(resolvedUrl);
    if (redirectError) {
      throw new Error(`Redirect blocked: ${redirectError} (redirected to ${resolvedUrl})`);
    }

    currentUrl = resolvedUrl;
  }

  throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
}

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
 * in the chain registry. Also matches against chain names from the registry
 * for V1 SDK compatibility (e.g., "base-sepolia").
 */
function resolveNetworkToChainId(network: string): number | undefined {
  // Try EIP-155 format first
  const match = network.match(/^eip155:(\d+)$/);
  if (match) {
    const chainId = parseInt(match[1], 10);
    return isChainSupported(chainId) ? chainId : undefined;
  }

  // Fall back to matching against registry networkString or chain name
  for (const config of SUPPORTED_CHAINS) {
    if (config.networkString === network) return config.chain.id;
    // Match by lowercase chain name (e.g., "base-sepolia" → baseSepolia)
    const normalizedName = config.chain.name.toLowerCase().replace(/\s+/g, "-");
    if (normalizedName === network.toLowerCase()) return config.chain.id;
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
  // Build list of supported chains from the accepts array
  const candidates: Array<{ chainId: number; acceptIndex: number }> = [];
  for (let i = 0; i < accepts.length; i++) {
    const resolvedChainId = resolveNetworkToChainId(accepts[i].network);
    if (resolvedChainId !== undefined) {
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
    // Explicit chain requested — validate it's in the accepts list
    const config = getChainConfig(chainId);
    if (!config) {
      return {
        success: false,
        status: "rejected",
        signingStrategy: "rejected",
        error: `Chain ${chainId} is not supported`,
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
        error: `None of the endpoint's accepted networks are supported`,
      };
    }
    selectedChainId = selection.chainId;
    acceptIndex = selection.acceptIndex;
  }

  const selectedChainConfig = getChainConfig(selectedChainId)!;

  // Step 4: Look up the user's smart account for the selected chain (with session key for signing)
  const smartAccount = await getSmartAccountWithSessionKey(userId, selectedChainId);

  // Step 5: Determine the amount from the selected requirement
  // SDK V2 uses `amount`, V1 uses `maxAmountRequired` — check both
  const selectedRequirement = paymentRequired.accepts[acceptIndex];
  const amountStr = selectedRequirement.amount
    ?? (selectedRequirement as unknown as { maxAmountRequired?: string }).maxAmountRequired
    ?? "0";
  const amountWei = BigInt(amountStr);
  const amountUsd = parseFloat(formatUnits(amountWei, USDC_DECIMALS));

  // If no smart account on this chain OR session key not active → fall back to manual approval
  if (!smartAccount || smartAccount.sessionKeyStatus !== "active") {
    const reason = !smartAccount ? "No smart account on selected chain" : "Session key not active";
    logger.info(`${reason}, requires manual approval`, { userId, url, action: "pending_approval", chainId: selectedChainId, amount: amountUsd });
    return {
      success: false,
      status: "pending_approval",
      signingStrategy: "manual_approval",
      paymentRequirements: JSON.stringify(paymentRequired),
      amount: amountUsd,
      chainId: selectedChainId,
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
      amount: amountUsd,
      chainId: selectedChainId,
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
      signer = await createSmartAccountSigner(
        sessionKeyHex,
        smartAccount.smartAccountAddress as `0x${string}`,
        selectedChainId,
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
    const matchingChain = siwxExtension?.supportedChains?.find(
      (chain: { chainId: string }) => chain.chainId === selectedChainConfig.networkString
    );

    if (!matchingChain) {
      return {
        success: false,
        status: "rejected",
        signingStrategy: "rejected",
        error: `SIVX failed: chain ${selectedChainConfig.networkString} not supported by server`,
      };
    }

    // Build complete info with selected chain
    const completeInfo = {
      ...siwxExtension.info,
      chainId: matchingChain.chainId,
      type: matchingChain.type,
    };

    // Create signed payload using the smart account signer's address
    const signerAccount = { address: signer.address, signMessage: async ({ message }: { message: string }) => {
      // SIWx uses personal_sign — smart account signers use signTypedData.
      // For now, pass through to signTypedData with EIP-191 wrapping.
      // This will need to be revisited if SIWx is used in production with smart accounts.
      return signer.signTypedData({
        domain: {},
        types: { EIP712Domain: [] },
        primaryType: "EIP712Domain",
        message: { raw: message },
      });
    }};
    const payload = await createSIWxPayload(completeInfo, signerAccount as Parameters<typeof createSIWxPayload>[1]);
    signInWithXHeader = encodeSIWxHeader(payload);
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

import { prisma } from "@/lib/db";

export type PolicyAction = "hot_wallet" | "walletconnect" | "rejected";

export interface PolicyCheckResult {
  action: PolicyAction;
  reason?: string;
  /** The matched EndpointPolicy id, if any. */
  policyId?: string;
  /** Whether the policy allows hot wallet signing. */
  payFromHotWallet?: boolean;
}

/**
 * Find the best-matching EndpointPolicy for a given endpoint URL.
 * Matches by longest prefix: an EndpointPolicy with endpointPattern "https://api.example.com"
 * matches URLs like "https://api.example.com/foo/bar".
 * Only returns active policies.
 */
async function findMatchingPolicy(userId: string, endpoint: string) {
  const policies = await prisma.endpointPolicy.findMany({
    where: { userId, status: "active" },
  });

  let bestMatch: (typeof policies)[number] | null = null;
  for (const policy of policies) {
    if (endpoint.startsWith(policy.endpointPattern)) {
      if (!bestMatch || policy.endpointPattern.length > bestMatch.endpointPattern.length) {
        bestMatch = policy;
      }
    }
  }
  return bestMatch;
}

/**
 * Extract the origin (scheme + host) from a URL to use as the default
 * endpoint pattern for auto-created draft policies.
 */
function extractHost(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return url;
  }
}

/**
 * Check whether a payment to `endpoint` is allowed under the user's
 * per-endpoint policies.
 *
 * Flow:
 * 1. Find best-matching EndpointPolicy (longest prefix match, active only)
 * 2. No match → reject + auto-create a draft policy for the endpoint origin
 * 3. payFromHotWallet=true  → "hot_wallet"
 * 4. payFromHotWallet=false → "walletconnect"
 *
 * Note: Amount-based checks (balance) are handled in executePayment.
 */
export async function checkPolicy(
  _amount: number,
  endpoint: string,
  userId: string,
): Promise<PolicyCheckResult> {
  const policy = await findMatchingPolicy(userId, endpoint);

  if (!policy) {
    // Auto-create a draft policy so the user can review and activate it
    const host = extractHost(endpoint);

    // Upsert: create a draft if none exists, or reactivate an archived policy
    await prisma.endpointPolicy.upsert({
      where: { userId_endpointPattern: { userId, endpointPattern: host } },
      create: { endpointPattern: host, userId, status: "draft" },
      update: { status: "draft", archivedAt: null },
    });

    return {
      action: "rejected",
      reason: `No active policy for "${endpoint}". A draft policy has been created — activate it to allow payments.`,
    };
  }

  const result = {
    policyId: policy.id,
    payFromHotWallet: policy.payFromHotWallet,
  };

  if (!policy.payFromHotWallet) {
    return { action: "walletconnect", ...result };
  }

  return { action: "hot_wallet", ...result };
}

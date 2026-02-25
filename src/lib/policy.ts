import { connectDB } from "@/lib/db";
import { EndpointPolicy, IEndpointPolicyDocument } from "@/lib/models/endpoint-policy";
import { Types } from "mongoose";
import { stringifyObjectId } from "@/lib/models/zod";

export type PolicyAction = "auto_sign" | "manual_approval" | "rejected";

export interface PolicyCheckResult {
  action: PolicyAction;
  reason?: string;
  /** The matched EndpointPolicy id, if any. */
  policyId?: string;
  /** Whether the policy allows automatic signing. */
  autoSign?: boolean;
}

const defaultChainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || "8453", 10);

/**
 * Find the best-matching EndpointPolicy for a given endpoint URL.
 * Matches by longest prefix: an EndpointPolicy with endpointPattern "https://api.example.com"
 * matches URLs like "https://api.example.com/foo/bar".
 * Only returns active policies for the specified chain.
 */
async function findMatchingPolicy(userId: string, endpoint: string, chainId?: number) {
  const filter: Record<string, unknown> = {
    userId: new Types.ObjectId(userId),
    status: "active",
    chainId: chainId ?? defaultChainId,
  };
  const policies = await EndpointPolicy.find(filter);

  let bestMatch: IEndpointPolicyDocument | null = null;
  for (const policy of policies) {
    if (endpoint.startsWith(policy.endpointPattern)) {
      // Verify the character after the pattern is a URL boundary (/, ?, #, or end-of-string)
      // to prevent cross-domain matches (e.g., pattern "https://api" matching "https://api-evil.com")
      const nextChar = endpoint[policy.endpointPattern.length];
      const patternEndsWithBoundary =
        policy.endpointPattern.endsWith("/") ||
        policy.endpointPattern.endsWith("?") ||
        policy.endpointPattern.endsWith("#");
      if (!patternEndsWithBoundary && nextChar !== undefined && nextChar !== "/" && nextChar !== "?" && nextChar !== "#") {
        continue;
      }
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
 * 3. autoSign=true  → "auto_sign"
 * 4. autoSign=false → "manual_approval"
 *
 * Note: Amount-based checks (balance) are handled in executePayment.
 */
export async function checkPolicy(
  _amount: number,
  endpoint: string,
  userId: string,
  chainId?: number,
): Promise<PolicyCheckResult> {
  await connectDB();

  const resolvedChainId = chainId ?? defaultChainId;
  const policy = await findMatchingPolicy(userId, endpoint, resolvedChainId);

  if (!policy) {
    // Auto-create a draft policy so the user can review and activate it
    const host = extractHost(endpoint);
    const userObjectId = new Types.ObjectId(userId);

    // Upsert: create a draft if none exists, or reactivate an archived policy
    await EndpointPolicy.findOneAndUpdate(
      { userId: userObjectId, endpointPattern: host, chainId: resolvedChainId },
      { $set: { status: "draft", archivedAt: null }, $setOnInsert: { endpointPattern: host, userId: userObjectId, chainId: resolvedChainId } },
      { upsert: true, returnDocument: "after" },
    );

    return {
      action: "rejected",
      reason: `No active policy for "${endpoint}". A draft policy has been created — activate it to allow payments.`,
    };
  }

  const result = {
    policyId: stringifyObjectId(policy._id, "endpointPolicy._id"),
    autoSign: policy.autoSign,
  };

  if (!policy.autoSign) {
    return { action: "manual_approval", ...result };
  }

  return { action: "auto_sign", ...result };
}

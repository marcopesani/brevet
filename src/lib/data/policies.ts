import {
  EndpointPolicy,
  EndpointPolicyDTO,
  type EndpointPolicyCreateInput,
  type EndpointPolicyUpdateInput,
} from "@/lib/models/endpoint-policy";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";

/**
 * Get endpoint policies for a user, optionally filtered by status and/or chainId.
 */
export async function getPolicies(userId: string, status?: string, options?: { chainId?: number }) {
  await connectDB();
  const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
  if (status) {
    filter.status = status;
  }
  if (options?.chainId !== undefined) {
    filter.chainId = options.chainId;
  }
  const docs = await EndpointPolicy.find(filter)
    .sort({ createdAt: -1 })
    .lean();
  return docs.map((doc) => EndpointPolicyDTO.parse(doc));
}

/**
 * Get a single endpoint policy by ID, scoped to the given user.
 * Returns null if not found or if the policy does not belong to the user.
 */
export async function getPolicy(policyId: string, userId: string) {
  await connectDB();
  const doc = await EndpointPolicy.findOne({
    _id: policyId,
    userId: new Types.ObjectId(userId),
  }).lean();

  if (!doc) return null;

  return EndpointPolicyDTO.parse(doc);
}

/**
 * Validate that an endpoint pattern is a well-formed URL with at least scheme + host.
 * Returns an error message if invalid, or null if valid.
 */
export function validateEndpointPattern(pattern: string): string | null {
  try {
    const parsed = new URL(pattern);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "Endpoint pattern must use http or https protocol";
    }
    if (!parsed.hostname) {
      return "Endpoint pattern must include a hostname";
    }
    return null;
  } catch {
    return "Endpoint pattern must be a valid URL (e.g., https://api.example.com)";
  }
}

/**
 * Create a new endpoint policy. Returns null if a policy for this endpoint pattern already exists.
 * Throws if the endpoint pattern is not a valid URL with scheme + host.
 */
export async function createPolicy(userId: string, data: EndpointPolicyCreateInput) {
  const patternError = validateEndpointPattern(data.endpointPattern);
  if (patternError) {
    throw new Error(patternError);
  }

  await connectDB();
  const userObjectId = new Types.ObjectId(userId);

  const existing = await EndpointPolicy.findOne({
    userId: userObjectId,
    endpointPattern: data.endpointPattern,
    chainId: data.chainId,
  }).lean();

  if (existing) {
    return null;
  }

  const doc = await EndpointPolicy.create({
    userId: userObjectId,
    endpointPattern: data.endpointPattern,
    chainId: data.chainId,
    ...(data.autoSign !== undefined && { autoSign: data.autoSign }),
    ...(data.status !== undefined && { status: data.status }),
  });
  const lean = doc.toObject();
  return EndpointPolicyDTO.parse(lean);
}

/**
 * Update an endpoint policy. Returns the updated policy.
 * Only updates if the policy belongs to the given user.
 * Checks for endpointPattern conflicts if the pattern is being changed.
 * Returns null if a conflict exists or the policy is not found for this user.
 */
export async function updatePolicy(policyId: string, userId: string, data: EndpointPolicyUpdateInput) {
  await connectDB();
  const userObjectId = new Types.ObjectId(userId);
  const scopedFilter = { _id: policyId, userId: userObjectId };

  if (data.endpointPattern !== undefined) {
    const existing = await EndpointPolicy.findOne(scopedFilter).lean();
    if (existing && data.endpointPattern !== existing.endpointPattern) {
      const conflict = await EndpointPolicy.findOne({
        userId: userObjectId,
        endpointPattern: data.endpointPattern,
        chainId: existing.chainId,
      }).lean();
      if (conflict) {
        return null;
      }
    }
  }

  const updateData: Record<string, unknown> = {};
  if (data.endpointPattern !== undefined) updateData.endpointPattern = data.endpointPattern;
  if (data.autoSign !== undefined) updateData.autoSign = data.autoSign;
  if (data.status !== undefined) updateData.status = data.status;

  const doc = await EndpointPolicy.findOneAndUpdate(
    scopedFilter,
    { $set: updateData },
    { returnDocument: "after" },
  ).lean();

  if (!doc) return null;

  return EndpointPolicyDTO.parse(doc);
}

/**
 * Activate a policy (set status to "active").
 * Requires userId for defense-in-depth ownership verification.
 */
export async function activatePolicy(policyId: string, userId: string) {
  await connectDB();
  const doc = await EndpointPolicy.findOneAndUpdate(
    { _id: policyId, userId: new Types.ObjectId(userId) },
    { $set: { status: "active" } },
    { returnDocument: "after" },
  ).lean();

  if (!doc) return null;

  return EndpointPolicyDTO.parse(doc);
}

/**
 * Toggle the autoSign flag on a policy.
 * Requires userId for defense-in-depth ownership verification.
 */
export async function toggleAutoSign(policyId: string, userId: string, autoSign: boolean) {
  await connectDB();
  const doc = await EndpointPolicy.findOneAndUpdate(
    { _id: policyId, userId: new Types.ObjectId(userId) },
    { $set: { autoSign } },
    { returnDocument: "after" },
  ).lean();

  if (!doc) return null;

  return EndpointPolicyDTO.parse(doc);
}

/**
 * Archive a policy (soft-delete).
 * Requires userId for defense-in-depth ownership verification.
 */
export async function archivePolicy(policyId: string, userId: string) {
  await connectDB();
  const doc = await EndpointPolicy.findOneAndUpdate(
    { _id: policyId, userId: new Types.ObjectId(userId) },
    { $set: { status: "archived", archivedAt: new Date() } },
    { returnDocument: "after" },
  ).lean();

  if (!doc) return null;

  return EndpointPolicyDTO.parse(doc);
}

/**
 * Unarchive a policy (restore from archive to draft).
 * Requires userId for defense-in-depth ownership verification.
 */
export async function unarchivePolicy(policyId: string, userId: string) {
  await connectDB();
  const doc = await EndpointPolicy.findOneAndUpdate(
    { _id: policyId, userId: new Types.ObjectId(userId) },
    { $set: { status: "draft", archivedAt: null } },
    { returnDocument: "after" },
  ).lean();

  if (!doc) return null;

  return EndpointPolicyDTO.parse(doc);
}

/**
 * Ensure an active auto-sign policy exists for the given URL's origin on the
 * specified chain. Atomic upsert: creates the policy if missing, activates and
 * enables autoSign if it already exists (even as draft/archived).
 * Safe with the unique index on (userId, endpointPattern, chainId).
 */
export async function ensureAutoSignPolicy(userId: string, url: string, chainId: number) {
  const origin = new URL(url).origin;
  const patternError = validateEndpointPattern(origin);
  if (patternError) {
    throw new Error(`Invalid URL for auto-sign policy: ${patternError}`);
  }

  await connectDB();
  const userObjectId = new Types.ObjectId(userId);

  const doc = await EndpointPolicy.findOneAndUpdate(
    { userId: userObjectId, endpointPattern: origin, chainId },
    {
      $set: { autoSign: true, status: "active", archivedAt: null },
      $setOnInsert: { endpointPattern: origin, userId: userObjectId, chainId },
    },
    { upsert: true, returnDocument: "after" },
  ).lean();

  return EndpointPolicyDTO.parse(doc);
}

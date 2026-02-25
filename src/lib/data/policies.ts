import {
  EndpointPolicy,
  parseEndpointPolicyId,
  serializeEndpointPolicies,
  serializeEndpointPolicy,
  validateCreateEndpointPolicyInput,
  validateUpdateEndpointPolicyInput,
} from "@/lib/models/endpoint-policy";
import { parseObjectId } from "@/lib/models/zod";
import { connectDB } from "@/lib/db";

/**
 * Get endpoint policies for a user, optionally filtered by status and/or chainId.
 */
export async function getPolicies(userId: string, status?: string, options?: { chainId?: number }) {
  await connectDB();
  const filter: Record<string, unknown> = {
    userId: parseObjectId(userId, "userId"),
  };
  if (status) {
    filter.status = status;
  }
  if (options?.chainId !== undefined) {
    filter.chainId = options.chainId;
  }
  const docs = await EndpointPolicy.find(filter)
    .select("-userId")
    .sort({ createdAt: -1 })
    .lean();
  return serializeEndpointPolicies(docs);
}

/**
 * Get a single endpoint policy by ID.
 */
export async function getPolicy(policyId: string) {
  await connectDB();
  const policyObjectId = parseEndpointPolicyId(policyId);
  const doc = await EndpointPolicy.findById(policyObjectId).lean();
  return doc ? serializeEndpointPolicy(doc) : null;
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
export async function createPolicy(
  userId: string,
  data: {
    endpointPattern: string;
    autoSign?: boolean;
    status?: string;
    chainId?: number;
  },
) {
  const patternError = validateEndpointPattern(data.endpointPattern);
  if (patternError) {
    throw new Error(patternError);
  }

  await connectDB();
  const parsedInput = validateCreateEndpointPolicyInput({
    userId,
    ...data,
  });
  const userObjectId = parseObjectId(parsedInput.userId, "userId");

  const existingFilter: Record<string, unknown> = {
    userId: userObjectId,
    endpointPattern: parsedInput.endpointPattern,
  };
  if (parsedInput.chainId !== undefined) {
    existingFilter.chainId = parsedInput.chainId;
  }

  const existing = await EndpointPolicy.findOne(existingFilter).lean();

  if (existing) {
    return null;
  }

  const doc = await EndpointPolicy.create({
    userId: userObjectId,
    endpointPattern: parsedInput.endpointPattern,
    ...(parsedInput.autoSign !== undefined && { autoSign: parsedInput.autoSign }),
    ...(parsedInput.status !== undefined && { status: parsedInput.status }),
    ...(parsedInput.chainId !== undefined && { chainId: parsedInput.chainId }),
  });
  return serializeEndpointPolicy(doc.toObject());
}

/**
 * Update an endpoint policy. Returns the updated policy.
 * Checks for endpointPattern conflicts if the pattern is being changed.
 * Returns null if a conflict exists.
 */
export async function updatePolicy(
  policyId: string,
  userId: string,
  data: {
    endpointPattern?: string;
    autoSign?: boolean;
    status?: string;
  },
) {
  await connectDB();
  const policyObjectId = parseEndpointPolicyId(policyId);
  const userObjectId = parseObjectId(userId, "userId");
  const parsedInput = validateUpdateEndpointPolicyInput(data);

  if (parsedInput.endpointPattern !== undefined) {
    const existing = await EndpointPolicy.findById(policyObjectId).lean();
    if (existing && parsedInput.endpointPattern !== existing.endpointPattern) {
      const conflict = await EndpointPolicy.findOne({
        userId: userObjectId,
        endpointPattern: parsedInput.endpointPattern,
        chainId: existing.chainId,
      }).lean();
      if (conflict) {
        return null;
      }
    }
  }

  const updateData: Record<string, unknown> = {};
  if (parsedInput.endpointPattern !== undefined) {
    updateData.endpointPattern = parsedInput.endpointPattern;
  }
  if (parsedInput.autoSign !== undefined) updateData.autoSign = parsedInput.autoSign;
  if (parsedInput.status !== undefined) updateData.status = parsedInput.status;

  const doc = await EndpointPolicy.findByIdAndUpdate(
    policyObjectId,
    { $set: updateData },
    { returnDocument: "after", runValidators: true },
  ).lean();
  return doc ? serializeEndpointPolicy(doc) : null;
}

/**
 * Activate a policy (set status to "active").
 * Requires userId for defense-in-depth ownership verification.
 */
export async function activatePolicy(policyId: string, userId: string) {
  await connectDB();
  const policyObjectId = parseEndpointPolicyId(policyId);
  const userObjectId = parseObjectId(userId, "userId");
  const doc = await EndpointPolicy.findOneAndUpdate(
    { _id: policyObjectId, userId: userObjectId },
    { $set: { status: "active" } },
    { returnDocument: "after", runValidators: true },
  ).lean();
  return doc ? serializeEndpointPolicy(doc) : null;
}

/**
 * Toggle the autoSign flag on a policy.
 * Requires userId for defense-in-depth ownership verification.
 */
export async function toggleAutoSign(policyId: string, userId: string, autoSign: boolean) {
  await connectDB();
  const policyObjectId = parseEndpointPolicyId(policyId);
  const userObjectId = parseObjectId(userId, "userId");
  const doc = await EndpointPolicy.findOneAndUpdate(
    { _id: policyObjectId, userId: userObjectId },
    { $set: { autoSign } },
    { returnDocument: "after", runValidators: true },
  ).lean();
  return doc ? serializeEndpointPolicy(doc) : null;
}

/**
 * Archive a policy (soft-delete).
 * Requires userId for defense-in-depth ownership verification.
 */
export async function archivePolicy(policyId: string, userId: string) {
  await connectDB();
  const policyObjectId = parseEndpointPolicyId(policyId);
  const userObjectId = parseObjectId(userId, "userId");
  const doc = await EndpointPolicy.findOneAndUpdate(
    { _id: policyObjectId, userId: userObjectId },
    { $set: { status: "archived", archivedAt: new Date() } },
    { returnDocument: "after", runValidators: true },
  ).lean();
  return doc ? serializeEndpointPolicy(doc) : null;
}

/**
 * Unarchive a policy (restore from archive to draft).
 * Requires userId for defense-in-depth ownership verification.
 */
export async function unarchivePolicy(policyId: string, userId: string) {
  await connectDB();
  const policyObjectId = parseEndpointPolicyId(policyId);
  const userObjectId = parseObjectId(userId, "userId");
  const doc = await EndpointPolicy.findOneAndUpdate(
    { _id: policyObjectId, userId: userObjectId },
    { $set: { status: "draft", archivedAt: null } },
    { returnDocument: "after", runValidators: true },
  ).lean();
  return doc ? serializeEndpointPolicy(doc) : null;
}

import { EndpointPolicy } from "@/lib/models/endpoint-policy";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";

/** Map a lean Mongoose doc to an object with string `id`. */
function withId<T extends { _id: Types.ObjectId }>(doc: T): Omit<T, "_id"> & { id: string } {
  const { _id, ...rest } = doc;
  return { ...rest, id: _id.toString() };
}

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
  return docs.map(withId);
}

/**
 * Get a single endpoint policy by ID.
 */
export async function getPolicy(policyId: string) {
  await connectDB();
  const doc = await EndpointPolicy.findById(policyId).lean();
  return doc ? withId(doc) : null;
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
  const userObjectId = new Types.ObjectId(userId);

  const existingFilter: Record<string, unknown> = {
    userId: userObjectId,
    endpointPattern: data.endpointPattern,
  };
  if (data.chainId !== undefined) {
    existingFilter.chainId = data.chainId;
  }

  const existing = await EndpointPolicy.findOne(existingFilter).lean();

  if (existing) {
    return null;
  }

  const doc = await EndpointPolicy.create({
    userId: userObjectId,
    endpointPattern: data.endpointPattern,
    ...(data.autoSign !== undefined && { autoSign: data.autoSign }),
    ...(data.status !== undefined && { status: data.status }),
    ...(data.chainId !== undefined && { chainId: data.chainId }),
  });
  const lean = doc.toObject();
  return withId(lean);
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
  if (data.endpointPattern !== undefined) {
    const existing = await EndpointPolicy.findById(policyId).lean();
    if (existing && data.endpointPattern !== existing.endpointPattern) {
      const conflict = await EndpointPolicy.findOne({
        userId: new Types.ObjectId(userId),
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

  const doc = await EndpointPolicy.findByIdAndUpdate(
    policyId,
    { $set: updateData },
    { returnDocument: "after" },
  ).lean();
  return doc ? withId(doc) : null;
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
  return doc ? withId(doc) : null;
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
  return doc ? withId(doc) : null;
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
  return doc ? withId(doc) : null;
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
  return doc ? withId(doc) : null;
}

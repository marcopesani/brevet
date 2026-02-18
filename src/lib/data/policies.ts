import { EndpointPolicy } from "@/lib/models/endpoint-policy";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";

/** Map a lean Mongoose doc to an object with string `id`. */
function withId<T extends { _id: Types.ObjectId }>(doc: T): Omit<T, "_id"> & { id: string } {
  const { _id, ...rest } = doc;
  return { ...rest, id: _id.toString() };
}

/**
 * Get endpoint policies for a user, optionally filtered by status.
 */
export async function getPolicies(userId: string, status?: string) {
  await connectDB();
  const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
  if (status) {
    filter.status = status;
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
 * Create a new endpoint policy. Returns null if a policy for this endpoint pattern already exists.
 */
export async function createPolicy(
  userId: string,
  data: {
    endpointPattern: string;
    payFromHotWallet?: boolean;
    status?: string;
  },
) {
  await connectDB();
  const userObjectId = new Types.ObjectId(userId);

  const existing = await EndpointPolicy.findOne({
    userId: userObjectId,
    endpointPattern: data.endpointPattern,
  }).lean();

  if (existing) {
    return null;
  }

  const doc = await EndpointPolicy.create({
    userId: userObjectId,
    endpointPattern: data.endpointPattern,
    ...(data.payFromHotWallet !== undefined && { payFromHotWallet: data.payFromHotWallet }),
    ...(data.status !== undefined && { status: data.status }),
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
    payFromHotWallet?: boolean;
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
      }).lean();
      if (conflict) {
        return null;
      }
    }
  }

  const updateData: Record<string, unknown> = {};
  if (data.endpointPattern !== undefined) updateData.endpointPattern = data.endpointPattern;
  if (data.payFromHotWallet !== undefined) updateData.payFromHotWallet = data.payFromHotWallet;
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
 */
export async function activatePolicy(policyId: string) {
  await connectDB();
  const doc = await EndpointPolicy.findByIdAndUpdate(
    policyId,
    { $set: { status: "active" } },
    { returnDocument: "after" },
  ).lean();
  return doc ? withId(doc) : null;
}

/**
 * Toggle the payFromHotWallet flag on a policy.
 */
export async function toggleHotWallet(policyId: string, payFromHotWallet: boolean) {
  await connectDB();
  const doc = await EndpointPolicy.findByIdAndUpdate(
    policyId,
    { $set: { payFromHotWallet } },
    { returnDocument: "after" },
  ).lean();
  return doc ? withId(doc) : null;
}

/**
 * Archive a policy (soft-delete).
 */
export async function archivePolicy(policyId: string) {
  await connectDB();
  const doc = await EndpointPolicy.findByIdAndUpdate(
    policyId,
    { $set: { status: "archived", archivedAt: new Date() } },
    { returnDocument: "after" },
  ).lean();
  return doc ? withId(doc) : null;
}

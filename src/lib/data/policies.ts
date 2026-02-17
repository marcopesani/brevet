import { prisma } from "@/lib/db";

/**
 * Get endpoint policies for a user, optionally filtered by status.
 */
export async function getPolicies(userId: string, status?: string) {
  const where: { userId: string; status?: string } = { userId };
  if (status) {
    where.status = status;
  }
  return prisma.endpointPolicy.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get a single endpoint policy by ID.
 */
export async function getPolicy(policyId: string) {
  return prisma.endpointPolicy.findUnique({
    where: { id: policyId },
  });
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
  const existing = await prisma.endpointPolicy.findUnique({
    where: { userId_endpointPattern: { userId, endpointPattern: data.endpointPattern } },
  });
  if (existing) {
    return null;
  }

  return prisma.endpointPolicy.create({
    data: {
      userId,
      endpointPattern: data.endpointPattern,
      ...(data.payFromHotWallet !== undefined && { payFromHotWallet: data.payFromHotWallet }),
      ...(data.status !== undefined && { status: data.status }),
    },
  });
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
  if (data.endpointPattern !== undefined) {
    const existing = await prisma.endpointPolicy.findUnique({
      where: { id: policyId },
    });
    if (existing && data.endpointPattern !== existing.endpointPattern) {
      const conflict = await prisma.endpointPolicy.findUnique({
        where: { userId_endpointPattern: { userId, endpointPattern: data.endpointPattern } },
      });
      if (conflict) {
        return null;
      }
    }
  }

  const updateData: Record<string, unknown> = {};
  if (data.endpointPattern !== undefined) updateData.endpointPattern = data.endpointPattern;
  if (data.payFromHotWallet !== undefined) updateData.payFromHotWallet = data.payFromHotWallet;
  if (data.status !== undefined) updateData.status = data.status;

  return prisma.endpointPolicy.update({
    where: { id: policyId },
    data: updateData,
  });
}

/**
 * Activate a policy (set status to "active").
 */
export async function activatePolicy(policyId: string) {
  return prisma.endpointPolicy.update({
    where: { id: policyId },
    data: { status: "active" },
  });
}

/**
 * Toggle the payFromHotWallet flag on a policy.
 */
export async function toggleHotWallet(policyId: string, payFromHotWallet: boolean) {
  return prisma.endpointPolicy.update({
    where: { id: policyId },
    data: { payFromHotWallet },
  });
}

/**
 * Archive a policy (soft-delete).
 */
export async function archivePolicy(policyId: string) {
  return prisma.endpointPolicy.update({
    where: { id: policyId },
    data: { status: "archived", archivedAt: new Date() },
  });
}

"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  getPolicies as _getPolicies,
  getPolicy as _getPolicy,
  createPolicy as _createPolicy,
  updatePolicy as _updatePolicy,
  activatePolicy as _activatePolicy,
  toggleHotWallet as _toggleHotWallet,
  archivePolicy as _archivePolicy,
} from "@/lib/data/policies";

export async function getPolicies(status?: string) {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");
  return _getPolicies(auth.userId, status);
}

export async function getPolicy(policyId: string) {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  const policy = await _getPolicy(policyId);
  if (!policy) throw new Error("Policy not found");
  if (policy.userId.toString() !== auth.userId) throw new Error("Forbidden");
  return policy;
}

export async function createPolicy(data: {
  endpointPattern: string;
  payFromHotWallet?: boolean;
  status?: string;
}) {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  const policy = await _createPolicy(auth.userId, data);
  if (!policy) throw new Error("A policy for this endpoint pattern already exists");

  revalidatePath("/dashboard/policies");
  return policy;
}

export async function updatePolicy(
  policyId: string,
  data: {
    endpointPattern?: string;
    payFromHotWallet?: boolean;
    status?: string;
  },
) {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  const existing = await _getPolicy(policyId);
  if (!existing) throw new Error("Policy not found");
  if (existing.userId.toString() !== auth.userId) throw new Error("Forbidden");

  const policy = await _updatePolicy(policyId, auth.userId, data);
  if (!policy) throw new Error("A policy for this endpoint pattern already exists");

  revalidatePath("/dashboard/policies");
  return policy;
}

export async function activatePolicy(policyId: string) {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  const existing = await _getPolicy(policyId);
  if (!existing) throw new Error("Policy not found");
  if (existing.userId.toString() !== auth.userId) throw new Error("Forbidden");

  const policy = await _activatePolicy(policyId);

  revalidatePath("/dashboard/policies");
  return policy;
}

export async function toggleHotWallet(policyId: string, payFromHotWallet: boolean) {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  const existing = await _getPolicy(policyId);
  if (!existing) throw new Error("Policy not found");
  if (existing.userId.toString() !== auth.userId) throw new Error("Forbidden");

  const policy = await _toggleHotWallet(policyId, payFromHotWallet);

  revalidatePath("/dashboard/policies");
  return policy;
}

export async function archivePolicy(policyId: string) {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  const existing = await _getPolicy(policyId);
  if (!existing) throw new Error("Policy not found");
  if (existing.userId.toString() !== auth.userId) throw new Error("Forbidden");

  if (existing.status === "archived") throw new Error("Policy is already archived");

  const policy = await _archivePolicy(policyId);

  revalidatePath("/dashboard/policies");
  return policy;
}

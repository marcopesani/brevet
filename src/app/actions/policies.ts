"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  getPolicies as _getPolicies,
  getPolicy as _getPolicy,
  createPolicy as _createPolicy,
  updatePolicy as _updatePolicy,
  activatePolicy as _activatePolicy,
  toggleAutoSign as _toggleAutoSign,
  archivePolicy as _archivePolicy,
  unarchivePolicy as _unarchivePolicy,
} from "@/lib/data/policies";
import type { EndpointPolicyDTO } from "@/lib/models/endpoint-policy";

export async function getPolicies(status?: string, options?: { chainId?: number }): Promise<EndpointPolicyDTO[]> {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");
  return _getPolicies(auth.userId, status, options);
}

export async function getPolicy(policyId: string): Promise<EndpointPolicyDTO> {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  const policy = await _getPolicy(policyId);
  if (!policy) throw new Error("Policy not found");
  if (policy.userId !== auth.userId) throw new Error("Forbidden");
  return policy;
}

export async function createPolicy(data: {
  endpointPattern: string;
  autoSign?: boolean;
  status?: string;
  chainId?: number;
}): Promise<{ success: true; policy: EndpointPolicyDTO } | { success: false; error: string }> {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  const policy = await _createPolicy(auth.userId, data);
  if (!policy) {
    return { success: false, error: "A policy for this endpoint pattern already exists" };
  }

  revalidatePath("/dashboard/policies");
  return { success: true, policy };
}

export async function updatePolicy(
  policyId: string,
  data: {
    endpointPattern?: string;
    autoSign?: boolean;
    status?: string;
  },
): Promise<EndpointPolicyDTO> {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  const existing = await _getPolicy(policyId);
  if (!existing) throw new Error("Policy not found");
  if (existing.userId !== auth.userId) throw new Error("Forbidden");

  const policy = await _updatePolicy(policyId, auth.userId, data);
  if (!policy) throw new Error("A policy for this endpoint pattern already exists");

  revalidatePath("/dashboard/policies");
  return policy;
}

export async function activatePolicy(policyId: string): Promise<EndpointPolicyDTO> {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  const existing = await _getPolicy(policyId);
  if (!existing) throw new Error("Policy not found");
  if (existing.userId !== auth.userId) throw new Error("Forbidden");

  const policy = await _activatePolicy(policyId, auth.userId);
  if (!policy) throw new Error("Policy not found");

  revalidatePath("/dashboard/policies");
  return policy;
}

export async function toggleAutoSign(policyId: string, autoSign: boolean): Promise<EndpointPolicyDTO> {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  const existing = await _getPolicy(policyId);
  if (!existing) throw new Error("Policy not found");
  if (existing.userId !== auth.userId) throw new Error("Forbidden");

  const policy = await _toggleAutoSign(policyId, auth.userId, autoSign);
  if (!policy) throw new Error("Policy not found");

  revalidatePath("/dashboard/policies");
  return policy;
}

export async function archivePolicy(policyId: string): Promise<EndpointPolicyDTO> {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  const existing = await _getPolicy(policyId);
  if (!existing) throw new Error("Policy not found");
  if (existing.userId !== auth.userId) throw new Error("Forbidden");

  if (existing.status === "archived") throw new Error("Policy is already archived");

  const policy = await _archivePolicy(policyId, auth.userId);
  if (!policy) throw new Error("Policy not found");

  revalidatePath("/dashboard/policies");
  return policy;
}

export async function unarchivePolicy(policyId: string): Promise<EndpointPolicyDTO> {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  const existing = await _getPolicy(policyId);
  if (!existing) throw new Error("Policy not found");
  if (existing.userId !== auth.userId) throw new Error("Forbidden");

  if (existing.status !== "archived") throw new Error("Policy is not archived");

  const policy = await _unarchivePolicy(policyId, auth.userId);
  if (!policy) throw new Error("Policy not found");

  revalidatePath("/dashboard/policies");
  return policy;
}

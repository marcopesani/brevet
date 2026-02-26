"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedUser } from "@/lib/auth";
import { ok, err } from "@/lib/action-result";
import { withAuth } from "@/lib/action-result-server";
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
import type {
  EndpointPolicyDTO,
  EndpointPolicyCreateInput,
  EndpointPolicyUpdateInput,
} from "@/lib/models/endpoint-policy";

// ---------------------------------------------------------------------------
// Reads — keep throwing (consumed by Server Components / error boundaries)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Mutations — return ActionResult<T>
// ---------------------------------------------------------------------------

export async function createPolicy(data: EndpointPolicyCreateInput) {
  return withAuth(async (auth) => {
    const policy = await _createPolicy(auth.userId, data);
    if (!policy) {
      return err("A policy for this endpoint pattern already exists");
    }

    revalidatePath("/dashboard/policies");
    return ok(policy);
  });
}

export async function updatePolicy(policyId: string, data: EndpointPolicyUpdateInput) {
  return withAuth(async (auth) => {
    const existing = await _getPolicy(policyId);
    if (!existing) return err("Policy not found");
    if (existing.userId !== auth.userId) return err("Forbidden");

    const policy = await _updatePolicy(policyId, auth.userId, data);
    if (!policy) return err("A policy for this endpoint pattern already exists");

    revalidatePath("/dashboard/policies");
    return ok(policy);
  });
}

export async function activatePolicy(policyId: string) {
  return withAuth(async (auth) => {
    const existing = await _getPolicy(policyId);
    if (!existing) return err("Policy not found");
    if (existing.userId !== auth.userId) return err("Forbidden");

    const policy = await _activatePolicy(policyId, auth.userId);
    if (!policy) return err("Policy not found");

    revalidatePath("/dashboard/policies");
    return ok(policy);
  });
}

export async function toggleAutoSign(policyId: string, autoSign: boolean) {
  return withAuth(async (auth) => {
    const existing = await _getPolicy(policyId);
    if (!existing) return err("Policy not found");
    if (existing.userId !== auth.userId) return err("Forbidden");

    const policy = await _toggleAutoSign(policyId, auth.userId, autoSign);
    if (!policy) return err("Policy not found");

    revalidatePath("/dashboard/policies");
    return ok(policy);
  });
}

export async function archivePolicy(policyId: string) {
  return withAuth(async (auth) => {
    const existing = await _getPolicy(policyId);
    if (!existing) return err("Policy not found");
    if (existing.userId !== auth.userId) return err("Forbidden");
    if (existing.status === "archived") return err("Policy is already archived");

    const policy = await _archivePolicy(policyId, auth.userId);
    if (!policy) return err("Policy not found");

    revalidatePath("/dashboard/policies");
    return ok(policy);
  });
}

export async function unarchivePolicy(policyId: string) {
  return withAuth(async (auth) => {
    const existing = await _getPolicy(policyId);
    if (!existing) return err("Policy not found");
    if (existing.userId !== auth.userId) return err("Forbidden");
    if (existing.status !== "archived") return err("Policy is not archived");

    const policy = await _unarchivePolicy(policyId, auth.userId);
    if (!policy) return err("Policy not found");

    revalidatePath("/dashboard/policies");
    return ok(policy);
  });
}

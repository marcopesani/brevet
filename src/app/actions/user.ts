"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  getUserEnabledChains as _getUserEnabledChains,
  setUserEnabledChains as _setUserEnabledChains,
} from "@/lib/data/user";

export async function getEnabledChainsAction(): Promise<number[]> {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");
  return _getUserEnabledChains(auth.userId);
}

export async function updateEnabledChainsAction(
  chainIds: number[],
): Promise<number[]> {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  const result = await _setUserEnabledChains(auth.userId, chainIds);
  revalidatePath("/dashboard/settings");
  return result;
}

"use server";

import { revalidatePath } from "next/cache";
import { ok } from "@/lib/action-result";
import { withAuth } from "@/lib/action-result-server";
import { setUserEnabledChains as _setUserEnabledChains } from "@/lib/data/user";

export async function updateEnabledChainsAction(chainIds: number[]) {
  return withAuth(async (auth) => {
    const result = await _setUserEnabledChains(auth.userId, chainIds);
    revalidatePath("/dashboard/settings");
    return ok(result);
  });
}

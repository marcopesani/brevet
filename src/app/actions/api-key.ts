"use server";

import { revalidatePath } from "next/cache";
import { ok } from "@/lib/action-result";
import { withAuth } from "@/lib/action-result-server";
import { rotateApiKey as _rotateApiKey } from "@/lib/data/users";

export async function regenerateApiKey() {
  return withAuth(async (auth) => {
    const { rawKey } = await _rotateApiKey(auth.userId);
    revalidatePath("/dashboard/settings");
    return ok({ rawKey });
  });
}

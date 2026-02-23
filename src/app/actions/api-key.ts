"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  getApiKeyPrefix as _getApiKeyPrefix,
  rotateApiKey as _rotateApiKey,
} from "@/lib/data/users";

export async function getApiKeyInfo() {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  const prefix = await _getApiKeyPrefix(auth.userId);
  return { prefix };
}

export async function regenerateApiKey() {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  const { rawKey } = await _rotateApiKey(auth.userId);

  revalidatePath("/dashboard/settings");
  revalidatePath("/dapp/dapp");

  return { rawKey };
}

"use server";

import { revalidatePath, updateTag } from "next/cache";
import { getAuthenticatedUser } from "@/lib/auth";
import { getSmartAccountBalance } from "@/lib/data/smart-account";
import { withdrawFromWallet as _withdrawFromWallet } from "@/lib/data/wallet";

export async function getWalletBalance(chainId?: number) {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  const result = await getSmartAccountBalance(auth.userId, chainId);
  if (!result) return null;
  return result;
}

export async function withdrawFromWallet(amount: number, toAddress: string, chainId?: number) {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  const result = await _withdrawFromWallet(auth.userId, amount, toAddress, chainId);

  revalidatePath("/dashboard/wallet");
  revalidatePath("/dashboard/transactions");
  revalidatePath("/dashboard/history");
  updateTag(`transactions-${auth.userId}`);
  updateTag(`analytics-${auth.userId}`);

  return result;
}

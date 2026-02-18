"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  getWalletBalance as _getWalletBalance,
  ensureHotWallet as _ensureHotWallet,
  withdrawFromWallet as _withdrawFromWallet,
} from "@/lib/data/wallet";

export async function getWalletBalance(chainId?: number) {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  const result = await _getWalletBalance(auth.userId, chainId);
  if (!result) throw new Error("Hot wallet not found");
  return result;
}

export async function ensureHotWallet(chainId?: number) {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  const result = await _ensureHotWallet(auth.userId, chainId);
  if (!result) throw new Error("User not found");

  revalidatePath("/dashboard/wallet");
  return result;
}

export async function withdrawFromWallet(amount: number, toAddress: string, chainId?: number) {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  const result = await _withdrawFromWallet(auth.userId, amount, toAddress, chainId);

  revalidatePath("/dashboard/wallet");
  revalidatePath("/dashboard/transactions");

  return result;
}

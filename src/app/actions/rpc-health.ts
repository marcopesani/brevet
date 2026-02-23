"use server";

import { getRpcHealth } from "@/lib/rpc-health";

/**
 * Returns the current per-chain RPC health snapshot.
 * No auth check — this is app infrastructure status, not user data.
 */
export async function getRpcHealthAction() {
  return getRpcHealth();
}

"use server";

import { getAuthenticatedUser } from "@/lib/auth";
import { getAnalytics as _getAnalytics } from "@/lib/data/analytics";

export async function getAnalytics() {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");
  return _getAnalytics(auth.userId);
}

import type { Metadata } from "next";
import { headers } from "next/headers";
import { getAuthenticatedUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Policies",
};
import { getPolicies } from "@/lib/data/policies";
import { getInitialChainIdFromCookie } from "@/lib/chain-cookie";
import PoliciesContent from "./policies-content";

export default async function PoliciesPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }

  const headersList = await headers();
  const cookieHeader = headersList.get("cookie");
  const initialChainId = getInitialChainIdFromCookie(cookieHeader);

  const policies = await getPolicies(user.userId, undefined, { chainId: initialChainId });

  return <PoliciesContent allPolicies={policies} />;
}

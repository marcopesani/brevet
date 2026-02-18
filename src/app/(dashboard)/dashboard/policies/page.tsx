import { getAuthenticatedUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getPolicies } from "@/lib/data/policies";
import PoliciesContent from "./policies-content";

export default async function PoliciesPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }

  const policies = await getPolicies(user.userId);

  return <PoliciesContent allPolicies={policies} />;
}

import { getAuthenticatedUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PolicyTable } from "@/components/policy-table";
import { getPolicies } from "@/lib/data/policies";

export default async function PoliciesPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }

  const policies = await getPolicies(user.userId);

  return (
    <div className="flex flex-col gap-6">
      <PolicyTable initialPolicies={policies} />
    </div>
  );
}

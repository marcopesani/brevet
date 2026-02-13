import { getAuthenticatedUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PolicyTable } from "@/components/policy-table";

export default async function PoliciesPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex flex-col gap-6">
      <PolicyTable />
    </div>
  );
}

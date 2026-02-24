import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { DappShell } from "@/components/dapp-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <DappShell>
      {children}
    </DappShell>
  );
}

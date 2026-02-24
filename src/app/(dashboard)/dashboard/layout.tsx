import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";

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
    <DashboardShell walletAddress={user.walletAddress}>
      {children}
    </DashboardShell>
  );
}

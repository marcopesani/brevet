import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";

export const metadata: Metadata = {
  title: {
    template: "%s | Brevet",
    default: "Dashboard | Brevet",
  },
};

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

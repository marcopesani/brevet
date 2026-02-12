import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import DashboardNav from "@/components/DashboardNav";

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

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
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
              PayMCP Dashboard
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {truncateAddress(user.walletAddress)}
            </p>
          </div>
          <LogoutButton />
        </div>

        <DashboardNav />

        {children}
      </div>
    </div>
  );
}

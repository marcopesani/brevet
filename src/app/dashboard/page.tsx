import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/SignOutButton";
import HotWalletInfo from "@/components/HotWalletInfo";
import SpendingSummary from "@/components/SpendingSummary";
import SpendingChart from "@/components/SpendingChart";
import SpendingPolicies from "@/components/SpendingPolicies";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  const userId = data?.claims?.sub as string;
  const email = (data?.claims?.email as string) ?? "";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
              PayMCP Dashboard
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{email}</p>
          </div>
          <SignOutButton />
        </div>

        {/* Navigation */}
        <nav className="mb-6 flex gap-4 border-b border-zinc-200 dark:border-zinc-800">
          <Link
            href="/dashboard"
            className="border-b-2 border-black px-1 pb-2 text-sm font-medium text-black dark:border-zinc-50 dark:text-zinc-50"
          >
            Wallet & Policies
          </Link>
          <Link
            href="/dashboard/history"
            className="border-b-2 border-transparent px-1 pb-2 text-sm text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            History
          </Link>
        </nav>

        <div className="flex flex-col gap-6">
          <SpendingSummary userId={userId} />
          <SpendingChart userId={userId} />
          <HotWalletInfo />
          <SpendingPolicies userId={userId} />
        </div>
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getAuthenticatedUser } from "@/lib/auth";
import { getValidatedChainId } from "@/lib/server/chain";
import { getAnalytics } from "@/lib/data/analytics";
import { getSmartAccountBalance } from "@/lib/data/smart-account";
import { getPendingCount } from "@/lib/data/payments";
import { getRecentTransactions } from "@/lib/data/transactions";
import { SectionCards } from "@/components/section-cards";
import { PendingAlert } from "@/components/pending-alert";
import { SpendingChart } from "@/components/spending-chart";
import { RecentTransactions } from "@/components/recent-transactions";

export default async function DashboardPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const headersList = await headers();
  const cookieHeader = headersList.get("cookie");
  const chainId = await getValidatedChainId(cookieHeader, user.userId);

  const [analytics, wallet, pendingCount, recentTransactions] =
    await Promise.all([
      getAnalytics(user.userId, { chainId }),
      getSmartAccountBalance(user.userId, chainId),
      getPendingCount(user.userId, { chainId }),
      getRecentTransactions(user.userId, 5, { chainId }),
    ]);

  return (
    <div className="flex flex-col gap-4">
      <SectionCards summary={analytics.summary} wallet={wallet} />
      <PendingAlert count={pendingCount} />
      <SpendingChart initialData={analytics.dailySpending} />
      <RecentTransactions transactions={recentTransactions} />
    </div>
  );
}

import { getAuthenticatedUser } from "@/lib/auth";
import { getAnalytics } from "@/lib/data/analytics";
import { getSmartAccountBalance } from "@/lib/data/smart-account";
import { getPendingCount } from "@/lib/data/payments";
import { getRecentTransactions } from "@/lib/data/transactions";
import { SectionCards } from "@/components/section-cards";
import { PendingAlert } from "@/components/pending-alert";
import { SpendingChart } from "@/components/spending-chart";
import { RecentTransactions } from "@/components/recent-transactions";

export default async function DashboardPage() {
  // Layout already redirects unauthenticated users — safe to assert non-null
  const user = (await getAuthenticatedUser())!;

  const [analytics, wallet, pendingCount, recentTransactions] =
    await Promise.all([
      getAnalytics(user.userId),
      getSmartAccountBalance(user.userId),
      getPendingCount(user.userId),
      getRecentTransactions(user.userId, 5),
    ]);

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <SectionCards summary={analytics.summary} wallet={wallet} />
      <PendingAlert count={pendingCount} />
      <SpendingChart initialData={analytics.dailySpending} />
      <RecentTransactions transactions={recentTransactions} />
    </div>
  );
}

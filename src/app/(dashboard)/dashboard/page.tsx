import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { getInitialChainIdFromCookie } from "@/lib/chain-cookie";
import { getAnalytics } from "@/lib/data/analytics";
import { getSmartAccountBalance } from "@/lib/data/smart-account";
import { getPendingCount } from "@/lib/data/payments";
import { getRecentTransactions } from "@/lib/data/transactions";
import { getOnboardingState } from "@/lib/data/users";
import { SectionCards } from "@/components/section-cards";
import { PendingAlert } from "@/components/pending-alert";
import { SpendingChart } from "@/components/spending-chart";
import { RecentTransactions } from "@/components/recent-transactions";
import { OnboardingBanner } from "@/components/onboarding/onboarding-banner";

export default async function DashboardPage() {
  // Layout already redirects unauthenticated users — safe to assert non-null
  const user = (await getAuthenticatedUser())!;

  const onboardingState = await getOnboardingState(user.userId);

  const onboardingIncomplete =
    onboardingState.currentStep < 3 && !onboardingState.completedAt;
  const notDismissed = !onboardingState.dismissedAt;

  // Redirect to setup wizard if onboarding is incomplete and not dismissed
  if (onboardingIncomplete && notDismissed) {
    redirect("/dashboard/setup");
  }

  const headersList = await headers();
  const cookieHeader = headersList.get("cookie");
  const chainId = getInitialChainIdFromCookie(cookieHeader);

  const [analytics, wallet, pendingCount, recentTransactions] =
    await Promise.all([
      getAnalytics(user.userId, { chainId }),
      getSmartAccountBalance(user.userId, chainId),
      getPendingCount(user.userId, { chainId }),
      getRecentTransactions(user.userId, 5, { chainId }),
    ]);

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <OnboardingBanner userId={user.userId} />
      <SectionCards summary={analytics.summary} wallet={wallet} />
      <PendingAlert count={pendingCount} />
      <SpendingChart initialData={analytics.dailySpending} />
      <RecentTransactions transactions={recentTransactions} />
    </div>
  );
}

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Suspense } from "react";
import { getAuthenticatedUser } from "@/lib/auth";
import { getValidatedChainId } from "@/lib/server/chain";
import { getPendingCount } from "@/lib/data/payments";
import { getRecentTransactions } from "@/lib/data/transactions";
import type { TransactionDTO } from "@/lib/models/transaction";
import { SectionCards } from "@/components/section-cards";
import { PendingAlert } from "@/components/pending-alert";
import { SummaryChart } from "@/components/summary-chart";
import { RecentTransactions } from "@/components/recent-transactions";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// ── Async Server Components for streaming ──────────────────────────────────

async function RecentTransactionsWrapper({
  userId,
  chainId,
}: {
  userId: string;
  chainId: number;
}) {
  const transactions: TransactionDTO[] = await getRecentTransactions(
    userId,
    5,
    { chainId }
  );
  return <RecentTransactions transactions={transactions} />;
}

function RecentTransactionsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Dashboard Page ─────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const headersList = await headers();
  const cookieHeader = headersList.get("cookie");
  const chainId = await getValidatedChainId(cookieHeader, user.userId);

  // Only fetch data needed for non-streaming components
  // SectionCards and RecentTransactions handle their own data
  const pendingCount = await getPendingCount(user.userId, { chainId });

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <SectionCards userId={user.userId} chainId={chainId} />
      <PendingAlert count={pendingCount} />
      <SummaryChart userId={user.userId} chainId={chainId} />
      <Suspense fallback={<RecentTransactionsSkeleton />}>
        <RecentTransactionsWrapper userId={user.userId} chainId={chainId} />
      </Suspense>
    </div>
  );
}

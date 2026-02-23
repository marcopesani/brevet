import { Skeleton } from "@/components/ui/skeleton";
import { BalanceCardSkeleton } from "@/components/dapp/balance-card-skeleton";
import { PendingStackSkeleton } from "@/components/dapp/pending-stack-skeleton";
import { PolicyListSkeleton } from "@/components/dapp/policy-list-skeleton";
import { TransactionFeedSkeleton } from "@/components/dapp/transaction-feed-skeleton";

export default function DappLoading() {
  return (
    <div className="flex flex-col gap-4 py-4">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32 rounded-full" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>

      {/* Balance card skeleton */}
      <BalanceCardSkeleton />

      {/* Pending cards skeleton */}
      <PendingStackSkeleton />

      {/* Policies skeleton */}
      <PolicyListSkeleton />

      {/* Activity feed skeleton */}
      <TransactionFeedSkeleton />

      {/* Bottom spacer */}
      <div className="h-8" />
    </div>
  );
}

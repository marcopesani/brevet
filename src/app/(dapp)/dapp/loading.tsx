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
        <Skeleton className="h-6 w-24 rounded-full" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </div>

      <BalanceCardSkeleton />
      <PendingStackSkeleton />
      <PolicyListSkeleton />
      <TransactionFeedSkeleton />
      <div className="h-8" />
    </div>
  );
}

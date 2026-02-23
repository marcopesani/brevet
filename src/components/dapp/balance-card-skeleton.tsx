import { Skeleton } from "@/components/ui/skeleton";

export function BalanceCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="space-y-4">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-12 w-32" />
        <Skeleton className="h-4 w-24" />
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}

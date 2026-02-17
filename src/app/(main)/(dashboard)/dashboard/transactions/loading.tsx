import { Skeleton } from "@/components/ui/skeleton";

export default function TransactionsLoading() {
  return (
    <div className="flex flex-col gap-6">
      {/* Page header skeleton */}
      <div>
        <Skeleton className="h-7 w-44" />
        <Skeleton className="mt-1 h-4 w-72" />
      </div>

      {/* TransactionTable skeleton — same structure as history */}
      <div className="flex flex-col gap-4">
        {/* Date filter row */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-10 w-36" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-6" />
            <Skeleton className="h-10 w-36" />
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border">
          <div className="space-y-0">
            <div className="flex gap-4 border-b px-4 py-3">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-32 flex-1" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-24" />
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-4 border-b px-4 py-3 last:border-b-0">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";

export default function HistoryLoading() {
  return (
    <div className="flex flex-col gap-4">
      {/* Date filter row skeleton */}
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

      {/* Table skeleton */}
      <div className="rounded-lg border">
        <div className="space-y-0">
          {/* Header row */}
          <div className="flex gap-4 border-b px-4 py-3">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-32 flex-1" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
          {/* Data rows */}
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
  );
}

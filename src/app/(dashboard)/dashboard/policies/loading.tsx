import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";

export default function PoliciesLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Tabs skeleton */}
          <Skeleton className="h-10 w-72" />

          {/* Table rows skeleton */}
          <div className="space-y-0">
            {/* Header row */}
            <div className="flex gap-4 border-b px-4 py-3">
              <Skeleton className="h-4 w-48 flex-1" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
            </div>
            {/* Data rows */}
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-4 border-b px-4 py-3 last:border-b-0">
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-5 w-10" />
                <Skeleton className="h-8 w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

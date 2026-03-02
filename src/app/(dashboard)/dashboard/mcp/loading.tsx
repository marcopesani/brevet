import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";

export default function McpLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72 mt-2" />
      </div>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-52" />
          <Skeleton className="h-4 w-80" />
        </CardHeader>
        <CardContent className="space-y-5">
          {/* API key area */}
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-9 w-20" />
          </div>

          {/* Tab list */}
          <Skeleton className="h-9 w-full rounded-lg" />

          {/* Tab content steps */}
          <div className="space-y-4 mt-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="size-6 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-64" />
                  {i > 0 && <Skeleton className="h-10 w-full" />}
                </div>
              </div>
            ))}
          </div>

          {/* Expandable sections */}
          <Skeleton className="h-px w-full" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-px w-full" />
          <Skeleton className="h-4 w-44" />
        </CardContent>
      </Card>
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";

export function ValueSkeleton() {
  return <Skeleton className="h-8 w-24" />;
}

export function ChartSkeleton() {
  return <Skeleton className="h-[250px] w-full" />;
}

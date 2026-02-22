import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";

export default function SetupLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl py-6 md:py-10">
      <Card>
        <CardHeader className="pb-2">
          {/* Stepper skeleton */}
          <div className="flex items-center justify-between">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex flex-1 items-center">
                <div className="flex flex-col items-center gap-1.5">
                  <Skeleton className="size-8 rounded-full" />
                  <Skeleton className="h-3 w-16" />
                </div>
                {i < 4 && <Skeleton className="mx-2 h-0.5 flex-1" />}
              </div>
            ))}
          </div>
          <Skeleton className="mx-auto mt-3 h-4 w-28" />
        </CardHeader>

        <CardContent className="min-h-[280px]">
          {/* Step content skeleton */}
          <div className="space-y-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="mt-6 h-32 w-full rounded-lg" />
          </div>
        </CardContent>

        <CardFooter className="flex-col gap-4">
          <div className="flex w-full items-center justify-between">
            <Skeleton className="h-9 w-16" />
            <Skeleton className="h-9 w-24" />
          </div>
          <Skeleton className="h-3 w-32" />
        </CardFooter>
      </Card>
    </div>
  );
}

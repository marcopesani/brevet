import { Suspense } from "react";
import { getAuthenticatedUser } from "@/lib/auth";
import { SectionCards } from "@/components/section-cards";
import { PendingAlert } from "@/components/pending-alert";
import { SpendingChart } from "@/components/spending-chart";
import { RecentTransactions } from "@/components/recent-transactions";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";

function CardsSkeleton() {
  return (
    <div className="grid grid-cols-4 gap-4 px-4 lg:px-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="@container/card">
          <CardHeader>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-32" />
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-28" />
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="px-4 lg:px-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[250px] w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="px-4 lg:px-6">
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
    </div>
  );
}

export default async function DashboardPage() {
  await getAuthenticatedUser();

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <Suspense fallback={<CardsSkeleton />}>
        <SectionCards />
      </Suspense>
      <Suspense fallback={null}>
        <PendingAlert />
      </Suspense>
      <Suspense fallback={<ChartSkeleton />}>
        <SpendingChart />
      </Suspense>
      <Suspense fallback={<TableSkeleton />}>
        <RecentTransactions />
      </Suspense>
    </div>
  );
}

import { cache, Suspense } from "react";
import { getAnalytics } from "@/lib/data/analytics";
import type { DailyMetrics } from "@/lib/data/analytics";
import { ValueSkeleton } from "./skeleton";

const getChartData = cache(async (userId: string, chainId: number) => {
  const analytics = await getAnalytics(userId, chainId);
  return {
    dailyMetrics: analytics.dailyMetrics,
    metricsSummary: analytics.metricsSummary,
  };
});

interface SlotProps {
  userId: string;
  chainId: number;
}

// Expose promise for client-side use() integration
export function getChartDataPromise(userId: string, chainId: number): Promise<DailyMetrics[]> {
  return getChartData(userId, chainId).then((data) => data.dailyMetrics);
}

// Internal async components
async function CountValueAsync({ userId, chainId }: SlotProps) {
  const { metricsSummary } = await getChartData(userId, chainId);
  return <>{metricsSummary.totalCount}</>;
}

async function SpendingValueAsync({ userId, chainId }: SlotProps) {
  const { metricsSummary } = await getChartData(userId, chainId);
  return <>${metricsSummary.totalSpending.toFixed(2)}</>;
}

async function SuccessRateValueAsync({ userId, chainId }: SlotProps) {
  const { metricsSummary } = await getChartData(userId, chainId);
  return <>{metricsSummary.overallSuccessRate.toFixed(1)}%</>;
}

// Exported wrappers with Suspense + fixed height containers
// These can be used in server components
export function CountValue({ userId, chainId }: SlotProps) {
  return (
    <span className="flex h-9 items-center">
      <Suspense fallback={<ValueSkeleton />}>
        <CountValueAsync userId={userId} chainId={chainId} />
      </Suspense>
    </span>
  );
}

export function SpendingValue({ userId, chainId }: SlotProps) {
  return (
    <span className="flex h-9 items-center">
      <Suspense fallback={<ValueSkeleton />}>
        <SpendingValueAsync userId={userId} chainId={chainId} />
      </Suspense>
    </span>
  );
}

export function SuccessRateValue({ userId, chainId }: SlotProps) {
  return (
    <span className="flex h-9 items-center">
      <Suspense fallback={<ValueSkeleton />}>
        <SuccessRateValueAsync userId={userId} chainId={chainId} />
      </Suspense>
    </span>
  );
}

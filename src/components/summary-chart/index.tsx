// Server Component - orchestrates SSR shell with streaming value slots
// No "use client" - this stays server-side

import { SummaryChartClient } from "./summary-chart-client";
import {
  CountValue,
  SpendingValue,
  SuccessRateValue,
  getChartDataPromise,
} from "./slots";

interface SummaryChartProps {
  userId: string;
  chainId: number;
}

export function SummaryChart({ userId, chainId }: SummaryChartProps) {
  // Value slots with built-in Suspense fallbacks - render immediately
  const countSlot = <CountValue userId={userId} chainId={chainId} />;
  const spendingSlot = <SpendingValue userId={userId} chainId={chainId} />;
  const successRateSlot = <SuccessRateValue userId={userId} chainId={chainId} />;

  // Chart data promise - will be resolved by inner Suspense in client
  const dailyMetricsPromise = getChartDataPromise(userId, chainId);

  return (
    <SummaryChartClient
      countSlot={countSlot}
      spendingSlot={spendingSlot}
      successRateSlot={successRateSlot}
      dailyMetricsPromise={dailyMetricsPromise}
    />
  );
}

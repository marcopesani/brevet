"use client";

import * as React from "react";
import { Suspense } from "react";

import { ChartShell } from "./shell";
import { ChartArea } from "./chart";
import { ChartSkeleton } from "./skeleton";
import type { MetricType, DailyMetrics } from "./types";

interface SummaryChartClientProps {
  // Value slots (pre-wrapped with Suspense on server)
  countSlot: React.ReactNode;
  spendingSlot: React.ReactNode;
  successRateSlot: React.ReactNode;
  // Chart data promise - resolved by inner Suspense
  dailyMetricsPromise: Promise<DailyMetrics[]>;
}

// Inner component that suspends only on the chart data
function ChartSlotWithPromise({
  dailyMetricsPromise,
  activeMetric,
}: {
  dailyMetricsPromise: Promise<DailyMetrics[]>;
  activeMetric: MetricType;
}) {
  const dailyMetrics = React.use(dailyMetricsPromise);
  const hasData = dailyMetrics.some((d) => d.count > 0);

  if (!dailyMetrics.length || !hasData) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        No transaction data yet.
      </div>
    );
  }

  return (
    <ChartArea
      dailyMetrics={dailyMetrics}
      activeMetric={activeMetric}
      timeRange="30d"
    />
  );
}

export function SummaryChartClient({
  countSlot,
  spendingSlot,
  successRateSlot,
  dailyMetricsPromise,
}: SummaryChartClientProps) {
  const [activeMetric, setActiveMetric] = React.useState<MetricType>("spending");

  // chartSlot is the ONLY part that can suspend - inside the already-rendered shell
  const chartSlot = (
    <Suspense fallback={<ChartSkeleton />}>
      <ChartSlotWithPromise
        dailyMetricsPromise={dailyMetricsPromise}
        activeMetric={activeMetric}
      />
    </Suspense>
  );

  return (
    <ChartShell
      activeMetric={activeMetric}
      onMetricChange={setActiveMetric}
      countSlot={countSlot}
      spendingSlot={spendingSlot}
      successRateSlot={successRateSlot}
      chartSlot={chartSlot}
    />
  );
}

export { ChartSkeleton };
export type { MetricType, DailyMetrics };

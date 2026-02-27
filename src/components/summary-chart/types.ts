import type { DailyMetrics as AnalyticsDailyMetrics, MetricsSummary } from "@/lib/data/analytics";

// Re-export for component use
export type DailyMetrics = AnalyticsDailyMetrics;

export type MetricType = "count" | "spending" | "successRate";

export interface SummaryChartProps {
  dailyMetrics: DailyMetrics[];
  metricsSummary: MetricsSummary;
}

export interface ChartShellProps {
  children: React.ReactNode;
}

export interface MetricTabProps {
  label: string;
  value: React.ReactNode;
  isActive?: boolean;
  onClick?: () => void;
}

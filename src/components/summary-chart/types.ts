import type { DailyMetrics as AnalyticsDailyMetrics } from "@/lib/data/analytics";

// Re-export for component use
export type DailyMetrics = AnalyticsDailyMetrics;

export type MetricType = "count" | "spending" | "successRate";

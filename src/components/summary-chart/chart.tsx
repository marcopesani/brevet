"use client";

import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { DailyMetrics, MetricType } from "./types";

const chartConfig: Record<MetricType, { label: string; color: string }> = {
  count: {
    label: "Count",
    color: "hsl(221, 83%, 53%)",
  },
  spending: {
    label: "Spending",
    color: "hsl(221, 83%, 53%)",
  },
  successRate: {
    label: "Success Rate",
    color: "hsl(221, 83%, 53%)",
  },
} satisfies ChartConfig;

function formatMetricValue(value: number, metric: MetricType): string {
  if (metric === "spending") {
    return `$${value.toFixed(2)}`;
  }
  if (metric === "successRate") {
    return `${value.toFixed(1)}%`;
  }
  return value.toString();
}

function formatYAxisTick(value: number, metric: MetricType): string {
  if (metric === "spending") {
    return `$${value.toFixed(2)}`;
  }
  if (metric === "successRate") {
    return `${value.toFixed(0)}%`;
  }
  return value.toString();
}

interface ChartAreaProps {
  dailyMetrics: DailyMetrics[];
  activeMetric: MetricType;
  timeRange: string;
}

export function ChartArea({ dailyMetrics, activeMetric, timeRange }: ChartAreaProps) {
  const filteredData = React.useMemo(() => {
    if (!dailyMetrics.length) return [];
    const referenceDate = new Date(dailyMetrics[dailyMetrics.length - 1].date);
    let daysToSubtract = 30;
    if (timeRange === "90d") {
      daysToSubtract = 90;
    } else if (timeRange === "7d") {
      daysToSubtract = 7;
    }
    const startDate = new Date(referenceDate);
    startDate.setDate(startDate.getDate() - daysToSubtract);
    return dailyMetrics.filter((item) => new Date(item.date) >= startDate);
  }, [dailyMetrics, timeRange]);

  const yesterday = React.useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  }, []);

  if (!dailyMetrics.length) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        No transaction data yet.
      </div>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="h-full w-full">
      <AreaChart data={filteredData} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
          tickFormatter={(value) => {
            if (value === yesterday) {
              return "Yesterday";
            }
            const date = new Date(value);
            return date.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            });
          }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(value) => formatYAxisTick(value, activeMetric)}
        />
        <ChartTooltip
          cursor={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1, strokeDasharray: "4 4" }}
          content={
            <ChartTooltipContent
              labelFormatter={(value) => {
                if (value === yesterday) {
                  return "Yesterday";
                }
                return new Date(value).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                });
              }}
              formatter={(value) => [
                formatMetricValue(Number(value), activeMetric),
                chartConfig[activeMetric].label,
              ]}
              indicator="dot"
            />
          }
        />
        <Area
          dataKey={activeMetric}
          type="linear"
          fill={chartConfig[activeMetric].color}
          fillOpacity={0.15}
          stroke={chartConfig[activeMetric].color}
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}

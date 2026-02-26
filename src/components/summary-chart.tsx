"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { useIsMobile } from "@/hooks/use-mobile"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import type { DailyMetrics, MetricsSummary } from "@/lib/data/analytics"

type MetricType = "count" | "spending" | "successRate"

interface SummaryChartProps {
  dailyMetrics: DailyMetrics[]
  metricsSummary: MetricsSummary
}

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
} satisfies ChartConfig

function formatMetricValue(value: number, metric: MetricType): string {
  if (metric === "spending") {
    return `$${value.toFixed(2)}`
  }
  if (metric === "successRate") {
    return `${value.toFixed(1)}%`
  }
  return value.toString()
}

function formatYAxisTick(value: number, metric: MetricType): string {
  if (metric === "spending") {
    return `$${value.toFixed(0)}`
  }
  if (metric === "successRate") {
    return `${value.toFixed(0)}%`
  }
  return value.toString()
}

export function SummaryChart({ dailyMetrics, metricsSummary }: SummaryChartProps) {
  const isMobile = useIsMobile()
  const [timeRange, setTimeRange] = React.useState("30d")
  const [activeMetric, setActiveMetric] = React.useState<MetricType>("spending")

  React.useEffect(() => {
    if (isMobile) {
      setTimeRange("7d")
    }
  }, [isMobile])

  const filteredData = React.useMemo(() => {
    if (!dailyMetrics.length) return []
    const referenceDate = new Date(dailyMetrics[dailyMetrics.length - 1].date)
    let daysToSubtract = 30
    if (timeRange === "90d") {
      daysToSubtract = 90
    } else if (timeRange === "7d") {
      daysToSubtract = 7
    }
    const startDate = new Date(referenceDate)
    startDate.setDate(startDate.getDate() - daysToSubtract)
    return dailyMetrics.filter((item) => new Date(item.date) >= startDate)
  }, [dailyMetrics, timeRange])

  const hasData = dailyMetrics.some((d) => d.count > 0)

  const yesterday = React.useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toISOString().split("T")[0]
  }, [])

  const summaryValue = React.useMemo(() => {
    switch (activeMetric) {
      case "count":
        return metricsSummary.totalCount
      case "spending":
        return metricsSummary.totalSpending
      case "successRate":
        return metricsSummary.overallSuccessRate
    }
  }, [activeMetric, metricsSummary])

  if (!dailyMetrics.length || !hasData) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold tracking-tight text-sm">No Data Available</h3>
              <p className="text-muted-foreground text-xs">Transaction data will appear here once payments are processed.</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex h-[250px] items-center justify-center text-muted-foreground text-sm">
            No transaction data yet.
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="@container/card p-0 gap-0 overflow-hidden">
      <CardHeader className="p-0 gap-0 !pb-0 border-b h-auto">
        <Tabs value={activeMetric} onValueChange={(v) => setActiveMetric(v as MetricType)} className="w-full">
          <TabsList variant="line" className="w-full flex justify-start gap-0 !h-auto bg-sidebar p-0 border-white">
            <TabsTrigger value="count" className="flex-1 lg:flex-none lg:w-48 flex-col items-start px-4 py-3 h-auto !bg-white border-0 border-r border-border rounded-none cursor-pointer after:-translate-y-[4px]">
              <span className="text-sm text-muted-foreground">Count</span>
              <span className="text-3xl font-semibold tabular-nums">{metricsSummary.totalCount}</span>
            </TabsTrigger>
            <TabsTrigger value="spending" className="flex-1 lg:flex-none lg:w-48 flex-col items-start px-4 py-3 h-auto !bg-white border-0 border-r border-border rounded-none cursor-pointer after:-translate-y-[4px]">
              <span className="text-sm text-muted-foreground">Spending</span>
              <span className="text-3xl font-semibold tabular-nums">${metricsSummary.totalSpending.toFixed(2)}</span>
            </TabsTrigger>
            <TabsTrigger value="successRate" className="flex-1 lg:flex-none lg:w-48 flex-col items-start px-4 py-3 h-auto !bg-white border-0 border-r border-border rounded-none cursor-pointer after:-translate-y-[4px]">
              <span className="text-sm text-muted-foreground">Success Rate</span>
              <span className="text-3xl font-semibold tabular-nums">{metricsSummary.overallSuccessRate.toFixed(1)}%</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="px-0 pt-4 sm:pt-6">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[250px] w-full"
        >
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
                  return "Yesterday"
                }
                const date = new Date(value)
                return date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
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
                      return "Yesterday"
                    }
                    return new Date(value).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
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
      </CardContent>
    </Card>
  )
}

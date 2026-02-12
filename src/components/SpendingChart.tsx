"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface DailySpending {
  date: string;
  amount: number;
}

interface SpendingChartProps {
  userId: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function SpendingChart({ userId }: SpendingChartProps) {
  const [data, setData] = useState<DailySpending[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(600);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/analytics?userId=${userId}`);
      if (res.ok) {
        const json = await res.json();
        setData(json.dailySpending);
      }
    } catch {
      // Network error
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">Loading chart...</p>
      </div>
    );
  }

  const hasSpending = data.some((d) => d.amount > 0);

  if (!data.length || !hasSpending) {
    return (
      <div className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
        <h2 className="mb-4 text-lg font-semibold text-black dark:text-zinc-50">
          Daily Spending
        </h2>
        <p className="text-sm text-zinc-500">No spending data yet.</p>
      </div>
    );
  }

  // Chart dimensions
  const paddingLeft = 50;
  const paddingRight = 10;
  const paddingTop = 20;
  const paddingBottom = 40;
  const chartWidth = containerWidth - paddingLeft - paddingRight;
  const chartHeight = 200;
  const svgHeight = chartHeight + paddingTop + paddingBottom;
  const svgWidth = containerWidth;

  const maxAmount = Math.max(...data.map((d) => d.amount), 0.01);
  const barWidth = Math.max((chartWidth / data.length) * 0.7, 2);
  const barGap = chartWidth / data.length;

  // Y-axis ticks (4 ticks)
  const yTicks = [0, 1, 2, 3, 4].map((i) => ({
    value: (maxAmount / 4) * i,
    y: paddingTop + chartHeight - (chartHeight / 4) * i,
  }));

  // X-axis labels — show every ~5th label to avoid overlap
  const labelInterval = Math.max(Math.ceil(data.length / 6), 1);

  return (
    <div
      ref={containerRef}
      className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800"
    >
      <h2 className="mb-4 text-lg font-semibold text-black dark:text-zinc-50">
        Daily Spending (Last 30 Days)
      </h2>
      <svg
        width="100%"
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="overflow-visible"
      >
        {/* Y-axis grid lines and labels */}
        {yTicks.map((tick) => (
          <g key={tick.value}>
            <line
              x1={paddingLeft}
              y1={tick.y}
              x2={svgWidth - paddingRight}
              y2={tick.y}
              className="stroke-zinc-200 dark:stroke-zinc-700"
              strokeWidth={1}
            />
            <text
              x={paddingLeft - 6}
              y={tick.y + 4}
              textAnchor="end"
              className="fill-zinc-400 text-[10px] dark:fill-zinc-500"
            >
              ${tick.value.toFixed(2)}
            </text>
          </g>
        ))}

        {/* Bars */}
        {data.map((d, i) => {
          const barHeight =
            maxAmount > 0 ? (d.amount / maxAmount) * chartHeight : 0;
          const x = paddingLeft + i * barGap + (barGap - barWidth) / 2;
          const y = paddingTop + chartHeight - barHeight;

          return (
            <g
              key={d.date}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              className="cursor-pointer"
            >
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barHeight, 0)}
                rx={2}
                className={
                  hoveredIndex === i
                    ? "fill-blue-400 dark:fill-blue-300"
                    : "fill-blue-500 dark:fill-blue-400"
                }
              />
              {/* Invisible wider hit area for hover */}
              <rect
                x={paddingLeft + i * barGap}
                y={paddingTop}
                width={barGap}
                height={chartHeight}
                fill="transparent"
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
              {/* Tooltip */}
              {hoveredIndex === i && (
                <g>
                  <rect
                    x={x + barWidth / 2 - 40}
                    y={y - 28}
                    width={80}
                    height={22}
                    rx={4}
                    className="fill-zinc-800 dark:fill-zinc-200"
                  />
                  <text
                    x={x + barWidth / 2}
                    y={y - 14}
                    textAnchor="middle"
                    className="fill-white text-[11px] font-medium dark:fill-zinc-900"
                  >
                    ${d.amount.toFixed(2)}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* X-axis labels */}
        {data.map((d, i) => {
          if (i % labelInterval !== 0) return null;
          const x = paddingLeft + i * barGap + barGap / 2;
          return (
            <text
              key={d.date}
              x={x}
              y={paddingTop + chartHeight + 20}
              textAnchor="middle"
              className="fill-zinc-400 text-[10px] dark:fill-zinc-500"
            >
              {formatDate(d.date)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { MetricType } from "./types";

interface MetricTabShellProps {
  value: MetricType;
  label: string;
  children: React.ReactNode;
  isActive?: boolean;
}

function MetricTabShell({ value, label, children, isActive }: MetricTabShellProps) {
  return (
    <TabsTrigger
      value={value}
      className={`flex-1 lg:flex-none lg:w-48 flex-col items-start px-4 py-3 h-auto !bg-white border-0 border-r border-border rounded-none cursor-pointer after:-translate-y-[4px] ${isActive ? "data-[state=active]:after:translate-y-[4px]" : ""}`}
    >
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="flex h-9 items-center text-3xl font-semibold tabular-nums">
        {children}
      </span>
    </TabsTrigger>
  );
}

interface ChartShellProps {
  activeMetric: MetricType;
  onMetricChange: (metric: MetricType) => void;
  countSlot: React.ReactNode;
  spendingSlot: React.ReactNode;
  successRateSlot: React.ReactNode;
  chartSlot: React.ReactNode;
}

export function ChartShell({
  activeMetric,
  onMetricChange,
  countSlot,
  spendingSlot,
  successRateSlot,
  chartSlot,
}: ChartShellProps) {
  return (
    <Card className="@container/card p-0 gap-0 overflow-hidden">
      <CardHeader className="p-0 gap-0 !pb-0 border-b h-auto">
        <Tabs
          value={activeMetric}
          onValueChange={(v) => onMetricChange(v as MetricType)}
          className="w-full"
        >
          <TabsList
            variant="line"
            className="w-full flex justify-start gap-0 !h-auto bg-sidebar p-0 border-white"
          >
            <MetricTabShell value="count" label="Count" isActive={activeMetric === "count"}>
              {countSlot}
            </MetricTabShell>
            <MetricTabShell value="spending" label="Spending" isActive={activeMetric === "spending"}>
              {spendingSlot}
            </MetricTabShell>
            <MetricTabShell
              value="successRate"
              label="Success Rate"
              isActive={activeMetric === "successRate"}
            >
              {successRateSlot}
            </MetricTabShell>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="px-0 pt-4 pr-4 pb-4 sm:pt-6 h-[250px]">
        {chartSlot}
      </CardContent>
    </Card>
  );
}

interface EmptyChartShellProps {
  children: React.ReactNode;
}

export function EmptyChartShell({ children }: EmptyChartShellProps) {
  return (
    <Card>
      <CardHeader className="h-auto">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold tracking-tight text-sm">No Data Available</h3>
            <p className="text-muted-foreground text-xs">
              Transaction data will appear here once payments are processed.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="h-[250px]">{children}</CardContent>
    </Card>
  );
}

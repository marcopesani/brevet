"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRpcHealthAction } from "@/app/actions/rpc-health";
import type { RpcStatus, RpcStatusLevel } from "@/lib/rpc-health";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getChainById } from "@/lib/chain-config";

const RPC_HEALTH_QUERY_KEY = ["rpc-health"] as const;

function statusColor(status: RpcStatusLevel) {
  switch (status) {
    case "degraded":
      return "bg-amber-500";
    case "down":
      return "bg-red-500";
    default:
      return "bg-green-500";
  }
}

function statusLabel(status: RpcStatusLevel) {
  switch (status) {
    case "degraded":
      return "Degraded";
    case "down":
      return "Down";
    default:
      return "Healthy";
  }
}

function badgeVariant(status: RpcStatusLevel): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "degraded":
      return "outline";
    case "down":
      return "destructive";
    default:
      return "secondary";
  }
}

function overallStatus(health: Record<number, RpcStatus>): RpcStatusLevel {
  let worst: RpcStatusLevel = "healthy";
  for (const { status } of Object.values(health)) {
    if (status === "down") return "down";
    if (status === "degraded") worst = "degraded";
  }
  return worst;
}

function formatTime(date: string | Date | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString();
}

export function RpcStatusIndicator() {
  const queryClient = useQueryClient();

  const { data: health } = useQuery({
    queryKey: RPC_HEALTH_QUERY_KEY,
    queryFn: getRpcHealthAction,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  // No data yet or all healthy with no tracked chains — hide the indicator
  if (!health || Object.keys(health).length === 0) return null;

  const overall = overallStatus(health);

  // Only show the dot when something is not healthy
  if (overall === "healthy") return null;

  const entries = Object.entries(health)
    .map(([chainIdStr, status]) => {
      const chainId = Number(chainIdStr);
      const chainConfig = getChainById(chainId);
      return { chainId, chainName: chainConfig?.displayName ?? `Chain ${chainId}`, status };
    })
    .filter(({ status }) => status.status !== "healthy")
    .sort((a, b) => {
      // down before degraded
      const order: Record<RpcStatusLevel, number> = { down: 0, degraded: 1, healthy: 2 };
      return order[a.status.status] - order[b.status.status];
    });

  function handleRetry() {
    queryClient.invalidateQueries({ queryKey: ["wallet-balance"] });
    queryClient.invalidateQueries({ queryKey: RPC_HEALTH_QUERY_KEY });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="relative flex items-center justify-center ml-auto rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`RPC status: ${overall}`}
        >
          <span
            className={`block h-2.5 w-2.5 rounded-full ${statusColor(overall)} animate-pulse`}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">RPC Status</p>
            <p className="text-xs text-muted-foreground">
              {overall === "degraded"
                ? "Rate limited — displayed data may be stale."
                : "One or more chains are unreachable."}
            </p>
          </div>

          <div className="space-y-2">
            {entries.map(({ chainId, chainName, status }) => (
              <div
                key={chainId}
                className="flex flex-col gap-1 rounded-md border px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{chainName}</span>
                  <Badge variant={badgeVariant(status.status)}>
                    {statusLabel(status.status)}
                  </Badge>
                </div>
                {status.lastError && (
                  <p className="text-xs text-muted-foreground truncate" title={status.lastError}>
                    {status.lastError}
                  </p>
                )}
                {status.lastErrorAt && (
                  <p className="text-xs text-muted-foreground">
                    Last error: {formatTime(status.lastErrorAt)}
                  </p>
                )}
              </div>
            ))}
          </div>

          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={handleRetry}
          >
            Retry now
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

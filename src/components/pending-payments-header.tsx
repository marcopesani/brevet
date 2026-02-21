"use client";

import { useChain } from "@/contexts/chain-context";

export function PendingPaymentsHeader() {
  const { activeChain } = useChain();

  return (
    <div>
      <h2 className="text-xl font-semibold">
        Pending Payments — {activeChain.displayName}
      </h2>
      <p className="text-sm text-muted-foreground">
        Review and approve payments requested by your MCP agent.
      </p>
    </div>
  );
}

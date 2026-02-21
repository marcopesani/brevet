"use client";

import { useChain } from "@/contexts/chain-context";

export function TransactionsHeader() {
  const { activeChain } = useChain();

  return (
    <div>
      <h2 className="text-xl font-semibold">
        Transaction History — {activeChain.displayName}
      </h2>
      <p className="text-sm text-muted-foreground">
        View and filter all payments and withdrawals.
      </p>
    </div>
  );
}

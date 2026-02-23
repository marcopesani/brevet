"use client";

import { useState, useMemo } from "react";
import { Activity, ArrowUpRight, ArrowDownLeft, AlertCircle, ExternalLink, Check } from "lucide-react";
import { getChainById, getDefaultChainConfig } from "@/lib/chain-config";
import { cn } from "@/lib/utils";
import { TxDetailDrawer } from "./tx-detail-drawer";

interface Transaction {
  id: string;
  amount: number;
  endpoint: string;
  txHash: string | null;
  network: string;
  chainId: number;
  status: string;
  type: string;
  errorMessage: string | null;
  responseStatus: number | null;
  createdAt: string;
  updatedAt: string;
}

interface TransactionFeedProps {
  transactions: Transaction[];
}

export function TransactionFeed({ transactions }: TransactionFeedProps) {
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  // Group by day
  const grouped = useMemo(() => {
    const groups: { date: string; txs: Transaction[] }[] = [];
    const dateMap = new Map<string, Transaction[]>();

    for (const tx of transactions) {
      const date = new Date(tx.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      if (!dateMap.has(date)) {
        dateMap.set(date, []);
      }
      dateMap.get(date)!.push(tx);
    }

    // Sort dates descending
    const sortedDates = Array.from(dateMap.keys()).sort((a, b) => {
      const dateA = new Date(a);
      const dateB = new Date(b);
      return dateB.getTime() - dateA.getTime();
    });

    for (const date of sortedDates) {
      groups.push({ date, txs: dateMap.get(date)! });
    }

    return groups;
  }, [transactions]);

  if (transactions.length === 0) {
    return (
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-muted-foreground">Activity</h2>
        </div>
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">No transactions yet</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-semibold">Activity</h2>
      </div>

      {/* Grouped transactions */}
      <div className="space-y-4">
        {grouped.map((group) => (
          <div key={group.date} className="space-y-2">
            {/* Date header */}
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {group.date}
            </p>

            {/* Transaction rows */}
            <div className="space-y-1">
              {group.txs.map((tx, index) => (
                <TransactionRow
                  key={tx.id}
                  transaction={tx}
                  onClick={() => setSelectedTx(tx)}
                  style={{ animationDelay: `${index * 30}ms` }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Detail drawer */}
      <TxDetailDrawer
        transaction={selectedTx}
        open={!!selectedTx}
        onOpenChange={(open) => !open && setSelectedTx(null)}
      />
    </section>
  );
}

function TransactionRow({
  transaction,
  onClick,
  style,
}: {
  transaction: Transaction;
  onClick: () => void;
  style?: React.CSSProperties;
}) {
  const chainConfig = getChainById(transaction.chainId) ?? getDefaultChainConfig();

  // Format endpoint for display
  const displayEndpoint = useMemo(() => {
    try {
      const url = new URL(transaction.endpoint);
      return url.hostname;
    } catch {
      return transaction.endpoint.length > 25
        ? transaction.endpoint.slice(0, 25) + "..."
        : transaction.endpoint;
    }
  }, [transaction.endpoint]);

  // Icon based on status/type
  const Icon = useMemo(() => {
    if (transaction.status === "failed" || transaction.errorMessage) {
      return AlertCircle;
    }
    if (transaction.status === "completed") {
      return Check;
    }
    return transaction.type === "withdrawal"
      ? ArrowUpRight
      : ArrowDownLeft;
  }, [transaction.status, transaction.errorMessage, transaction.type]);

  const iconColor = useMemo(() => {
    if (transaction.status === "failed" || transaction.errorMessage) {
      return "text-destructive bg-destructive/10";
    }
    if (transaction.status === "completed") {
      return "text-green-500 bg-green-500/10";
    }
    if (transaction.type === "withdrawal") {
      return "text-amber-500 bg-amber-500/10";
    }
    return "text-blue-500 bg-blue-500/10";
  }, [transaction.status, transaction.errorMessage, transaction.type]);

  return (
    <button
      onClick={onClick}
      className="animate-card-enter flex w-full items-center gap-3 rounded-lg border p-3 transition-all hover:bg-accent active:scale-[0.99]"
      style={style}
    >
      {/* Icon */}
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", iconColor)}>
        <Icon className="h-5 w-5" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-medium">{displayEndpoint}</p>
        <p className="text-xs text-muted-foreground">
          {new Date(transaction.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
          {" • "}
          {chainConfig.displayName}
        </p>
      </div>

      {/* Amount */}
      <div className="shrink-0 text-right">
        <p className={cn(
          "text-sm font-medium",
          transaction.type === "withdrawal" && "text-amber-600 dark:text-amber-400",
        )}>
          {transaction.type === "withdrawal" ? "-" : ""}
          ${transaction.amount.toFixed(2)}
        </p>
        <p className="text-xs text-muted-foreground">
          {transaction.status === "completed"
            ? "Confirmed"
            : transaction.status === "failed"
              ? "Failed"
              : "Pending"}
        </p>
      </div>
    </button>
  );
}

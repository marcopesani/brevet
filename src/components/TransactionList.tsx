"use client";

import { useCallback, useEffect, useState } from "react";
import TransactionDetail from "./TransactionDetail";

interface Transaction {
  id: string;
  amount: number;
  endpoint: string;
  txHash: string | null;
  network: string;
  status: string;
  type: string;
  userId: string;
  createdAt: string;
}

interface TransactionListProps {
  userId: string;
}

export default function TransactionList({ userId }: TransactionListProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ userId });
      if (since) params.set("since", new Date(since).toISOString());
      if (until) {
        // Set until to end of the selected day
        const untilDate = new Date(until);
        untilDate.setHours(23, 59, 59, 999);
        params.set("until", untilDate.toISOString());
      }

      const res = await fetch(`/api/transactions?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTransactions(data);
      }
    } catch {
      // Network error — leave list empty
    } finally {
      setLoading(false);
    }
  }, [userId, since, until]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  return (
    <div className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
      <h2 className="mb-4 text-lg font-semibold text-black dark:text-zinc-50">
        Transaction History
      </h2>

      {/* Date range filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">From</span>
          <input
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">To</span>
          <input
            type="date"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        {(since || until) && (
          <button
            type="button"
            onClick={() => {
              setSince("");
              setUntil("");
            }}
            className="rounded px-3 py-2 text-sm text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading transactions...</p>
      ) : transactions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No transactions found
          </p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Payments made through your MCP server will appear here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {transactions.map((tx) => (
            <TransactionDetail key={tx.id} transaction={tx} />
          ))}
        </div>
      )}
    </div>
  );
}

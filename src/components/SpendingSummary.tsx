"use client";

import { useCallback, useEffect, useState } from "react";

interface SummaryData {
  today: number;
  thisWeek: number;
  thisMonth: number;
  totalTransactions: number;
  avgPaymentSize: number;
}

interface SpendingSummaryProps {
  userId: string;
}

export default function SpendingSummary({ userId }: SpendingSummaryProps) {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch(`/api/analytics?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
      }
    } catch {
      // Network error — leave null
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  if (loading) {
    return (
      <div className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">Loading spending data...</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">Unable to load spending data.</p>
      </div>
    );
  }

  const cards = [
    { label: "Today", value: summary.today },
    { label: "This Week", value: summary.thisWeek },
    { label: "This Month", value: summary.thisMonth },
    { label: "Avg Payment", value: summary.avgPaymentSize },
  ];

  return (
    <div className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
      <h2 className="mb-4 text-lg font-semibold text-black dark:text-zinc-50">
        Spending Overview
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {card.label}
            </p>
            <p className="mt-1 text-xl font-semibold text-black dark:text-zinc-50">
              ${card.value.toFixed(2)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

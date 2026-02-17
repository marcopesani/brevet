"use client";

import { useQuery } from "@tanstack/react-query";
import type { PendingPayment } from "@/components/pending-payment-card";

export const PENDING_PAYMENTS_QUERY_KEY = ["pending-payments"] as const;

async function fetchPendingPayments(): Promise<PendingPayment[]> {
  const res = await fetch("/api/payments/pending");
  if (!res.ok) throw new Error("Failed to fetch pending payments");
  return res.json();
}

export function usePendingPayments() {
  const { data, isLoading, error } = useQuery({
    queryKey: PENDING_PAYMENTS_QUERY_KEY,
    queryFn: fetchPendingPayments,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  return {
    payments: data ?? [],
    count: data?.length ?? 0,
    isLoading,
    error,
  };
}

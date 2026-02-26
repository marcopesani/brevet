"use client";

import { useQuery } from "@tanstack/react-query";
import type { PendingPaymentDTO } from "@/lib/models/pending-payment";

export const PENDING_PAYMENTS_QUERY_KEY = ["pending-payments"] as const;

async function fetchPendingPayments(chainId?: number): Promise<PendingPaymentDTO[]> {
  const url = chainId !== undefined
    ? `/api/payments/pending?chainId=${chainId}`
    : "/api/payments/pending";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch pending payments");
  return res.json();
}

export function usePendingPayments(chainId?: number) {
  const { data, isLoading, error } = useQuery({
    queryKey: [...PENDING_PAYMENTS_QUERY_KEY, chainId],
    queryFn: () => fetchPendingPayments(chainId),
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

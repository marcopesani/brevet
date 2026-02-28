"use client";

import { useQuery } from "@tanstack/react-query";
import type { PendingPaymentDTO } from "@/lib/models/pending-payment";

export const PENDING_PAYMENTS_QUERY_KEY = ["pending-payments"] as const;

async function fetchPendingPayments(chainId?: number, includeExpired?: boolean): Promise<PendingPaymentDTO[]> {
  const params = new URLSearchParams();
  if (chainId !== undefined) params.set("chainId", String(chainId));
  if (includeExpired) params.set("includeExpired", "true");
  const qs = params.toString();
  const url = qs ? `/api/payments/pending?${qs}` : "/api/payments/pending";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch pending payments");
  return res.json();
}

export function usePendingPayments(chainId?: number, options?: { includeExpired?: boolean }) {
  const includeExpired = options?.includeExpired;
  const { data, isLoading, error } = useQuery({
    queryKey: [...PENDING_PAYMENTS_QUERY_KEY, chainId, includeExpired],
    queryFn: () => fetchPendingPayments(chainId, includeExpired),
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

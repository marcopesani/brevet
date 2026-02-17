"use client";

import { useQuery } from "@tanstack/react-query";
import { getWalletBalance } from "@/app/actions/wallet";

export const WALLET_BALANCE_QUERY_KEY = ["wallet-balance"] as const;

export function useWalletBalance(
  enabled: boolean = true,
  initialData?: { balance: string; address: string },
) {
  const { data, isLoading, error } = useQuery({
    queryKey: WALLET_BALANCE_QUERY_KEY,
    queryFn: () => getWalletBalance(),
    enabled,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
    ...(initialData ? { initialData } : {}),
  });

  return {
    balance: data?.balance ?? null,
    address: data?.address ?? null,
    isLoading,
    error,
  };
}

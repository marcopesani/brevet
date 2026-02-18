"use client";

import { useQuery } from "@tanstack/react-query";
import { getWalletBalance } from "@/app/actions/wallet";

export const WALLET_BALANCE_QUERY_KEY = ["wallet-balance"] as const;

export function useWalletBalance(
  enabled: boolean = true,
  initialData?: { balance: string; address: string },
  chainId?: number,
) {
  const queryKey = chainId
    ? [...WALLET_BALANCE_QUERY_KEY, chainId]
    : WALLET_BALANCE_QUERY_KEY;

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => getWalletBalance(chainId),
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

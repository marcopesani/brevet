"use client";

import { useQuery } from "@tanstack/react-query";
import { getSmartAccountBalanceAction } from "@/app/actions/smart-account";

export const WALLET_BALANCE_QUERY_KEY = ["wallet-balance"] as const;

export function useWalletBalance(
  enabled: boolean,
  initialData?: { balance: string; address: string },
  chainId?: number,
) {
  const queryKey = chainId
    ? [...WALLET_BALANCE_QUERY_KEY, chainId]
    : WALLET_BALANCE_QUERY_KEY;

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => getSmartAccountBalanceAction(chainId),
    enabled,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
    ...(initialData ? { initialData } : {}),
  });

  return {
    balance: data?.balance,
    address: data?.address,
    isLoading,
    error: error || undefined,
  };
}

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import WalletBalance from "@/components/wallet-balance";
import NoAccountCard from "./no-account-card";
import PendingGrantSection from "./pending-grant-section";
import ActiveWalletSection from "./active-wallet-section";
import { useWalletBalance } from "@/hooks/use-wallet-balance";
import { useChain } from "@/contexts/chain-context";
import {
  setupSmartAccount,
  getSmartAccountForChain,
  getAllSmartAccountsAction,
} from "@/app/actions/smart-account";

export interface WalletInitialData {
  smartAccount: Awaited<ReturnType<typeof getSmartAccountForChain>>;
  allAccounts: Awaited<ReturnType<typeof getAllSmartAccountsAction>>;
  balance: Awaited<ReturnType<typeof import("@/app/actions/smart-account").getSmartAccountBalanceAction>>;
}

interface WalletContentProps {
  initialData: WalletInitialData;
  initialChainId: number;
}

export default function WalletContent({
  initialData,
  initialChainId,
}: WalletContentProps) {
  const { activeChain, supportedChains } = useChain();
  const chainId = activeChain.chain.id;
  const queryClient = useQueryClient();
  const isInitialChain = chainId === initialChainId;
  const enabledChainIds = new Set(supportedChains.map((c) => c.chain.id));

  const {
    data: smartAccount,
    isLoading: accountLoading,
  } = useQuery({
    queryKey: ["smart-account", chainId],
    queryFn: () => getSmartAccountForChain(chainId),
    initialData: isInitialChain ? initialData.smartAccount : undefined,
  });

  const { data: allAccounts } = useQuery({
    queryKey: ["smart-accounts-all"],
    queryFn: () => getAllSmartAccountsAction(),
    initialData: initialData.allAccounts,
  });

  const { mutate: doSetup, isPending: setupPending } = useMutation({
    mutationFn: (cId: number) => setupSmartAccount(cId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["smart-account", chainId] });
      queryClient.invalidateQueries({ queryKey: ["smart-accounts-all"] });
    },
  });

  const smartAccountAddress = smartAccount?.smartAccountAddress;

  const {
    balance: liveBalance,
    isLoading: balanceLoading,
    error: balanceError,
  } = useWalletBalance(
    !!smartAccountAddress,
    isInitialChain && initialData.balance ? initialData.balance : undefined,
    chainId,
  );

  const sessionKeyStatus = smartAccount?.sessionKeyStatus;

  if (!accountLoading && !smartAccount) {
    return (
      <NoAccountCard
        chainId={chainId}
        chainName={activeChain.displayName}
        hasAnyAccounts={(allAccounts?.filter((a) => enabledChainIds.has(a.chainId)).length ?? 0) > 0}
        onSetup={doSetup}
        setupPending={setupPending}
      />
    );
  }

  if (sessionKeyStatus === "pending_grant") {
    return (
      <PendingGrantSection
        smartAccountAddress={smartAccountAddress}
        sessionKeyAddress={smartAccount?.sessionKeyAddress}
        chainId={chainId}
      />
    );
  }

  return (
    <ActiveWalletSection
      smartAccountAddress={smartAccountAddress}
      balance={liveBalance}
      balanceLoading={accountLoading || balanceLoading}
      balanceError={balanceError}
      chainName={activeChain.displayName}
      explorerUrl={activeChain.explorerUrl}
      sessionKeyStatus={sessionKeyStatus}
      chainId={chainId}
    />
  );
}

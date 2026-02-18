"use client";

import { useQuery } from "@tanstack/react-query";
import WalletBalance from "@/components/wallet-balance";
import FundWalletForm from "@/components/fund-wallet-form";
import WithdrawWalletForm from "@/components/withdraw-wallet-form";
import { useWalletBalance } from "@/hooks/use-wallet-balance";
import { useChain } from "@/contexts/chain-context";
import { ensureHotWallet } from "@/app/actions/wallet";

interface WalletContentProps {
  userId: string;
}

export default function WalletContent({ userId }: WalletContentProps) {
  const { activeChain } = useChain();
  const chainId = activeChain.chain.id;

  const { data: walletData, isLoading: walletLoading } = useQuery({
    queryKey: ["hot-wallet", chainId],
    queryFn: () => ensureHotWallet(chainId),
  });

  const hotWalletAddress = walletData?.address ?? null;

  const {
    balance: liveBalance,
    isLoading: balanceLoading,
    error: balanceError,
  } = useWalletBalance(!!hotWalletAddress, undefined, chainId);

  const balance = liveBalance;

  return (
    <div className="flex flex-col gap-6">
      <WalletBalance
        hotWalletAddress={hotWalletAddress}
        userId={userId}
        balance={balance}
        balanceLoading={walletLoading || balanceLoading}
        balanceError={balanceError}
        chainName={activeChain.chain.name}
        explorerUrl={activeChain.explorerUrl}
      />

      <div className="grid gap-6 md:grid-cols-2">
        <FundWalletForm hotWalletAddress={hotWalletAddress} chainId={chainId} />
        <WithdrawWalletForm balance={balance} chainId={chainId} />
      </div>
    </div>
  );
}

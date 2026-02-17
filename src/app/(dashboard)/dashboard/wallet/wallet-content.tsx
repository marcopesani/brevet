"use client";

import WalletBalance from "@/components/wallet-balance";
import FundWalletForm from "@/components/fund-wallet-form";
import WithdrawWalletForm from "@/components/withdraw-wallet-form";
import { useWalletBalance } from "@/hooks/use-wallet-balance";

interface WalletContentProps {
  hotWalletAddress: string | null;
  userId: string;
  initialBalance: string | null;
}

export default function WalletContent({
  hotWalletAddress,
  userId,
  initialBalance,
}: WalletContentProps) {
  const initialData =
    hotWalletAddress && initialBalance
      ? { balance: initialBalance, address: hotWalletAddress }
      : undefined;

  const {
    balance: liveBalance,
    isLoading: balanceLoading,
    error: balanceError,
  } = useWalletBalance(!!hotWalletAddress, initialData);

  const balance = liveBalance ?? initialBalance;

  return (
    <div className="flex flex-col gap-6">
      <WalletBalance
        hotWalletAddress={hotWalletAddress}
        userId={userId}
        balance={balance}
        balanceLoading={balanceLoading}
        balanceError={balanceError}
      />

      <div className="grid gap-6 md:grid-cols-2">
        <FundWalletForm hotWalletAddress={hotWalletAddress} />
        <WithdrawWalletForm balance={balance} />
      </div>
    </div>
  );
}

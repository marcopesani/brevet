"use client";

import { useWalletBalance } from "@/hooks/use-wallet-balance";
import FundWalletForm from "@/components/fund-wallet-form";
import WithdrawCard from "@/components/withdraw-card";

interface WalletFormsSectionProps {
  smartAccountAddress: string;
  chainId: number;
  initialBalance?: string;
}

export default function WalletFormsSection({
  smartAccountAddress,
  chainId,
  initialBalance,
}: WalletFormsSectionProps) {
  const { balance } = useWalletBalance(
    true,
    initialBalance ? { balance: initialBalance, address: smartAccountAddress } : undefined,
    chainId,
  );

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <FundWalletForm accountAddress={smartAccountAddress} chainId={chainId} />
      <WithdrawCard balance={balance} chainId={chainId} />
    </div>
  );
}

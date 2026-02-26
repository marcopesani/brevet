"use client";

import WalletBalance from "@/components/wallet-balance";
import FundWalletForm from "@/components/fund-wallet-form";
import WithdrawCard from "@/components/withdraw-card";
import type { SmartAccountDTO } from "@/lib/models/smart-account";

type ActiveWalletSectionAccount = Pick<SmartAccountDTO, "chainId"> &
  Partial<Pick<SmartAccountDTO, "smartAccountAddress" | "sessionKeyStatus">>;

interface ActiveWalletSectionProps extends ActiveWalletSectionAccount {
  balance?: string;
  balanceLoading: boolean;
  balanceError?: Error;
  chainName: string;
  explorerUrl: string;
}

export default function ActiveWalletSection({
  smartAccountAddress,
  balance,
  balanceLoading,
  balanceError,
  chainName,
  explorerUrl,
  sessionKeyStatus,
  chainId,
}: ActiveWalletSectionProps) {
  return (
    <div className="flex flex-col gap-6">
      <WalletBalance
        accountAddress={smartAccountAddress}
        balance={balance}
        balanceLoading={balanceLoading}
        balanceError={balanceError}
        chainName={chainName}
        explorerUrl={explorerUrl}
        sessionKeyStatus={sessionKeyStatus}
      />
      <div className="grid gap-6 md:grid-cols-2">
        <FundWalletForm accountAddress={smartAccountAddress} chainId={chainId} />
        <WithdrawCard balance={balance} chainId={chainId} />
      </div>
    </div>
  );
}

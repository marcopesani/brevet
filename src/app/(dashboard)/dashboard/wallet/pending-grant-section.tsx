"use client";

import SessionKeyAuthCard from "@/components/session-key-auth-card";
import FundWalletForm from "@/components/fund-wallet-form";

interface PendingGrantSectionProps {
  smartAccountAddress?: string;
  sessionKeyAddress?: string;
  chainId: number;
}

export default function PendingGrantSection({
  smartAccountAddress,
  sessionKeyAddress,
  chainId,
}: PendingGrantSectionProps) {
  return (
    <div className="flex flex-col gap-6">
      <SessionKeyAuthCard
        smartAccountAddress={smartAccountAddress}
        sessionKeyAddress={sessionKeyAddress}
        chainId={chainId}
      />
      <div className="grid gap-6 md:grid-cols-2">
        <FundWalletForm accountAddress={smartAccountAddress} chainId={chainId} />
      </div>
    </div>
  );
}

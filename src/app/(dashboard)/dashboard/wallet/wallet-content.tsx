"use client";

import { useState, useCallback } from "react";
import WalletBalance from "@/components/wallet-balance";
import FundWalletForm from "@/components/fund-wallet-form";
import WithdrawWalletForm from "@/components/withdraw-wallet-form";

interface WalletData {
  hotWalletAddress: string;
  userId: string;
  balance: string | null;
  fetchBalance: () => void;
}

export default function WalletContent({ userId }: { userId: string }) {
  const [walletData, setWalletData] = useState<WalletData | null>(null);

  const handleWalletReady = useCallback((data: WalletData) => {
    setWalletData(data);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <WalletBalance onWalletReady={handleWalletReady} />

      {walletData && (
        <div className="grid gap-6 md:grid-cols-2">
          <FundWalletForm
            hotWalletAddress={walletData.hotWalletAddress}
            onFunded={walletData.fetchBalance}
          />
          <WithdrawWalletForm
            userId={walletData.userId}
            balance={walletData.balance}
            onWithdrawn={walletData.fetchBalance}
          />
        </div>
      )}
    </div>
  );
}

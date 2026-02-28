import { Suspense } from "react";
import { cache } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { getSmartAccountBalance } from "@/lib/data/smart-account";
import WalletBalance from "@/components/wallet-balance";
import WalletFormsSection from "./wallet-forms-section";
import type { SmartAccountDTO } from "@/lib/models/smart-account";

const getCachedBalance = cache(
  (userId: string, chainId: number) => getSmartAccountBalance(userId, chainId),
);

interface ActiveWalletSectionProps {
  userId: string;
  chainId: number;
  smartAccountAddress: string;
  sessionKeyStatus: SmartAccountDTO["sessionKeyStatus"];
  chainName: string;
  explorerUrl: string;
}

async function BalanceValue({
  userId,
  chainId,
}: {
  userId: string;
  chainId: number;
}) {
  const data = await getCachedBalance(userId, chainId);
  const balance = data?.balance;
  return (
    <span className="text-3xl font-bold tracking-tight">
      {balance != null ? `$${balance}` : "N/A"}
    </span>
  );
}

function BalanceSkeleton() {
  return <Skeleton className="h-9 w-32" />;
}

export default function ActiveWalletSection({
  userId,
  chainId,
  smartAccountAddress,
  sessionKeyStatus,
  chainName,
  explorerUrl,
}: ActiveWalletSectionProps) {
  return (
    <div className="flex flex-col gap-6">
      <WalletBalance
        accountAddress={smartAccountAddress}
        chainName={chainName}
        explorerUrl={explorerUrl}
        sessionKeyStatus={sessionKeyStatus}
        balanceSlot={
          <Suspense fallback={<BalanceSkeleton />}>
            <BalanceValue userId={userId} chainId={chainId} />
          </Suspense>
        }
      />
      <WalletFormsSection
        smartAccountAddress={smartAccountAddress}
        chainId={chainId}
      />
    </div>
  );
}

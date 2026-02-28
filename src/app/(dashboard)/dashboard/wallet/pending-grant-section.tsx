import dynamic from "next/dynamic";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import FundWalletForm from "@/components/fund-wallet-form";

const SessionKeyAuthCard = dynamic(
  () => import("@/components/session-key-auth-card"),
  {
    loading: () => (
      <Card className="border-amber-200 dark:border-amber-800">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    ),
  }
);
import type { SmartAccountDTO } from "@/lib/models/smart-account";

type PendingGrantSectionProps = Pick<SmartAccountDTO, "chainId"> &
  Partial<Pick<SmartAccountDTO, "smartAccountAddress" | "sessionKeyAddress">>;

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

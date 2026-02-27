import { Suspense } from "react";
import { IconExternalLink } from "@tabler/icons-react";
import { NetworkIcon } from "@web3icons/react/dynamic";
import { TokenUSDC } from "@web3icons/react";

import { Skeleton } from "@/components/ui/skeleton";
import { getChainById } from "@/lib/chain-config";

import { StatCard } from "./stat-card";
import {
  BalanceFooterDetail,
  BalanceValue,
  ThisWeekFooterDetail,
  ThisWeekValue,
  TodaySpendFooterDetail,
  TodaySpendValue,
} from "./slots";
import type { SectionCardsProps } from "./types";

export function SectionCards({ userId, chainId }: SectionCardsProps) {
  const chainConfig = getChainById(chainId);

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        icon={<NetworkIcon chainId={chainId} variant="branded" className="size-6" />}
        label="Network"
        value={chainConfig?.displayName ?? "Unknown Network"}
        footerLabel={chainConfig?.isTestnet ? "Testnet" : "Mainnet"}
        footerDetail={
          chainConfig?.explorerUrl ? (
            <a
              href={chainConfig.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              View on Explorer
              <IconExternalLink className="size-3" />
            </a>
          ) : undefined
        }
      />

      <StatCard
        icon={<TokenUSDC variant="branded" className="size-6" />}
        label="USDC Balance"
        value={(
          <span className="flex h-8 items-center">
            <Suspense fallback={<Skeleton className="h-8 w-24" />}>
              <BalanceValue userId={userId} chainId={chainId} />
            </Suspense>
          </span>
        )}
        tabularNums
        footerLabel="Smart Account"
        footerDetail={(
          <span className="flex h-5 items-center">
            <Suspense fallback={<Skeleton className="h-4 w-32" />}>
              <BalanceFooterDetail userId={userId} chainId={chainId} />
            </Suspense>
          </span>
        )}
      />

      <StatCard
        label="Today Spend"
        value={(
          <span className="flex h-8 items-center">
            <Suspense fallback={<Skeleton className="h-8 w-24" />}>
              <TodaySpendValue userId={userId} chainId={chainId} />
            </Suspense>
          </span>
        )}
        tabularNums
        footerLabel="Spending today"
        footerDetail={(
          <span className="flex h-5 items-center">
            <Suspense fallback={<Skeleton className="h-4 w-36" />}>
              <TodaySpendFooterDetail userId={userId} chainId={chainId} />
            </Suspense>
          </span>
        )}
      />

      <StatCard
        label="This Week"
        value={(
          <span className="flex h-8 items-center">
            <Suspense fallback={<Skeleton className="h-8 w-24" />}>
              <ThisWeekValue userId={userId} chainId={chainId} />
            </Suspense>
          </span>
        )}
        tabularNums
        footerLabel="Weekly spending"
        footerDetail={(
          <span className="flex h-5 items-center">
            <Suspense fallback={<Skeleton className="h-4 w-36" />}>
              <ThisWeekFooterDetail userId={userId} chainId={chainId} />
            </Suspense>
          </span>
        )}
      />
    </div>
  );
}

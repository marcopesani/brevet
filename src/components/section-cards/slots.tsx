import { cache } from "react";
import { IconExternalLink } from "@tabler/icons-react";

import { getAnalytics } from "@/lib/data/analytics";
import { getSmartAccountBalance } from "@/lib/data/smart-account";
import { getChainById } from "@/lib/chain-config";

import type { CardDataProps } from "./types";

const getBalanceCardData = cache(async (userId: string, chainId: number) => {
  const wallet = await getSmartAccountBalance(userId, chainId);
  const chainConfig = getChainById(chainId);
  return { wallet, chainConfig };
});

const getSummaryCardData = cache(async (userId: string, chainId: number) => {
  const analytics = await getAnalytics(userId, chainId);
  return analytics.summary;
});

export async function BalanceValue({ userId, chainId }: CardDataProps) {
  const { wallet } = await getBalanceCardData(userId, chainId);
  return <>{wallet ? `$${wallet.balance}` : "N/A"}</>;
}

export async function BalanceFooterDetail({ userId, chainId }: CardDataProps) {
  const { wallet, chainConfig } = await getBalanceCardData(userId, chainId);
  if (!wallet) return <>No account found</>;

  const truncatedAddress = `${wallet.address.slice(0, 12)}...${wallet.address.slice(-4)}`;

  if (!chainConfig?.explorerUrl) {
    return (
      <span className="text-muted-foreground flex items-center gap-1">
        {truncatedAddress}
      </span>
    );
  }

  return (
    <a
      href={`${chainConfig.explorerUrl}/address/${wallet.address}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
    >
      {truncatedAddress}
      <IconExternalLink className="size-3" />
    </a>
  );
}

export async function TodaySpendValue({ userId, chainId }: CardDataProps) {
  const summary = await getSummaryCardData(userId, chainId);
  return <>${summary.today.toFixed(2)}</>;
}

export async function TodaySpendFooterDetail({ userId, chainId }: CardDataProps) {
  const summary = await getSummaryCardData(userId, chainId);
  return <>{summary.totalTransactions} total transactions</>;
}

export async function ThisWeekValue({ userId, chainId }: CardDataProps) {
  const summary = await getSummaryCardData(userId, chainId);
  return <>${summary.thisWeek.toFixed(2)}</>;
}

export async function ThisWeekFooterDetail({ userId, chainId }: CardDataProps) {
  const summary = await getSummaryCardData(userId, chainId);
  return <>Avg ${summary.avgPaymentSize.toFixed(2)} per payment</>;
}

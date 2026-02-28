import { cache } from "react";
import { getSmartAccount, getAllSmartAccounts } from "@/lib/data/smart-account";
import { getChainById } from "@/lib/chain-config";
import NoAccountCard from "./no-account-card";
import PendingGrantSection from "./pending-grant-section";
import ActiveWalletSection from "./active-wallet-section";
import ChainRefresher from "./chain-refresher";

const getCachedSmartAccount = cache(
  (userId: string, chainId: number) => getSmartAccount(userId, chainId),
);

const getCachedAllSmartAccounts = cache(
  (userId: string) => getAllSmartAccounts(userId),
);

interface WalletPageContentProps {
  userId: string;
  chainId: number;
}

export default async function WalletPageContent({
  userId,
  chainId,
}: WalletPageContentProps) {
  const [smartAccount, allAccounts] = await Promise.all([
    getCachedSmartAccount(userId, chainId),
    getCachedAllSmartAccounts(userId),
  ]);

  const chainConfig = getChainById(chainId);
  const chainName = chainConfig?.displayName ?? "Unknown";
  const explorerUrl = chainConfig?.explorerUrl ?? "";

  const enabledChainIds = new Set(allAccounts.map((a) => a.chainId));
  const hasAnyAccounts =
    allAccounts.filter((a) => enabledChainIds.has(a.chainId)).length > 0;

  return (
    <>
      <ChainRefresher serverChainId={chainId} />
      {!smartAccount ? (
        <NoAccountCard
          chainId={chainId}
          chainName={chainName}
          hasAnyAccounts={hasAnyAccounts}
        />
      ) : smartAccount.sessionKeyStatus === "pending_grant" ? (
        <PendingGrantSection
          smartAccountAddress={smartAccount.smartAccountAddress}
          sessionKeyAddress={smartAccount.sessionKeyAddress}
          chainId={chainId}
        />
      ) : (
        <ActiveWalletSection
          userId={userId}
          chainId={chainId}
          smartAccountAddress={smartAccount.smartAccountAddress}
          sessionKeyStatus={smartAccount.sessionKeyStatus}
          chainName={chainName}
          explorerUrl={explorerUrl}
        />
      )}
    </>
  );
}

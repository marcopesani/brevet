import { Suspense } from "react";
import { headers } from "next/headers";
import { getAuthenticatedUser } from "@/lib/auth";
import { getValidatedChainId } from "@/lib/server/chain";
import { getSmartAccountBalance, getSmartAccount } from "@/lib/data/smart-account";
import { getPendingPayments, getPendingCount } from "@/lib/data/payments";
import { getPolicies } from "@/lib/data/policies";
import { getRecentTransactions } from "@/lib/data/transactions";

import { DappHeader } from "@/components/dapp/dapp-header";
import { BalanceCard } from "@/components/dapp/balance-card";
import { BalanceCardSkeleton } from "@/components/dapp/balance-card-skeleton";
import { PendingPaymentStack } from "@/components/dapp/pending-payment-stack";
import { PendingStackSkeleton } from "@/components/dapp/pending-stack-skeleton";
import { PolicyList } from "@/components/dapp/policy-list";
import { PolicyListSkeleton } from "@/components/dapp/policy-list-skeleton";
import { TransactionFeed } from "@/components/dapp/transaction-feed";
import { TransactionFeedSkeleton } from "@/components/dapp/transaction-feed-skeleton";

// Helper to serialize dates safely
function serializeDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  if (typeof date === "string") return date;
  return date.toISOString();
}

// Server components for data fetching
async function BalanceSection({
  userId,
  chainId,
}: {
  userId: string;
  chainId: number;
}) {
  const [smartAccount, balanceData] = await Promise.all([
    getSmartAccount(userId, chainId),
    getSmartAccountBalance(userId, chainId),
  ]);

  return (
    <BalanceCard
      initialBalance={balanceData?.balance ?? "0"}
      address={balanceData?.address ?? smartAccount?.smartAccountAddress}
      sessionKeyStatus={smartAccount?.sessionKeyStatus}
      chainId={chainId}
      hasSmartAccount={!!smartAccount}
      walletAddress={smartAccount?.ownerAddress}
    />
  );
}

async function PendingSection({
  userId,
  chainId,
  walletAddress,
}: {
  userId: string;
  chainId: number;
  walletAddress: string;
}) {
  const pending = await getPendingPayments(userId, { chainId });

  // Serialize dates for client components - explicitly pick needed fields
  const serializedPending = pending.map((p) => ({
    id: p.id,
    url: p.url,
    amount: p.amount ?? undefined,
    amountRaw: p.amountRaw ?? undefined,
    asset: p.asset ?? undefined,
    chainId: p.chainId ?? undefined,
    paymentRequirements: p.paymentRequirements,
    status: p.status,
    createdAt: serializeDate(p.createdAt),
    expiresAt: serializeDate(p.expiresAt),
  }));

  return (
    <PendingPaymentStack
      initialPayments={serializedPending}
      walletAddress={walletAddress}
      chainId={chainId}
    />
  );
}

async function PolicySection({
  userId,
  chainId,
}: {
  userId: string;
  chainId: number;
}) {
  const policies = await getPolicies(userId, undefined, { chainId });

  // Serialize dates for client components
  const serializedPolicies = policies.map((p) => ({
    id: p.id,
    endpointPattern: p.endpointPattern,
    autoSign: p.autoSign,
    chainId: p.chainId,
    status: p.status,
    createdAt: serializeDate(p.createdAt),
    updatedAt: serializeDate(p.updatedAt),
    archivedAt: p.archivedAt ? serializeDate(p.archivedAt) : null,
  }));

  return <PolicyList initialPolicies={serializedPolicies} chainId={chainId} />;
}

async function ActivitySection({
  userId,
  chainId,
}: {
  userId: string;
  chainId: number;
}) {
  const transactions = await getRecentTransactions(userId, 20, { chainId });

  // Serialize dates for client components
  const serializedTransactions = transactions.map((t) => ({
    id: t.id,
    amount: t.amount,
    endpoint: t.endpoint,
    txHash: t.txHash,
    network: t.network,
    chainId: t.chainId,
    status: t.status,
    type: t.type ?? "payment",
    errorMessage: t.errorMessage,
    responseStatus: t.responseStatus,
    createdAt: serializeDate(t.createdAt),
    updatedAt: serializeDate((t as { updatedAt?: Date }).updatedAt ?? t.createdAt), // Fallback to createdAt if no updatedAt
  }));

  return <TransactionFeed transactions={serializedTransactions} />;
}

export default async function DappPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    // Should be caught by layout, but be safe
    return null;
  }

  const headersList = await headers();
  const cookieHeader = headersList.get("cookie");
  const chainId = await getValidatedChainId(cookieHeader, user.userId);

  // Get initial pending count for header
  const pendingCount = await getPendingCount(user.userId, { chainId });

  return (
    <div className="flex flex-col gap-4 py-4">
      {/* Header - always visible */}
      <DappHeader initialPendingCount={pendingCount} />

      {/* Zone B: Balance Card */}
      <Suspense fallback={<BalanceCardSkeleton />}>
        <BalanceSection userId={user.userId} chainId={chainId} />
      </Suspense>

      {/* Zone C: Pending Requests - collapsible */}
      <Suspense fallback={<PendingStackSkeleton />}>
        <PendingSection
          userId={user.userId}
          chainId={chainId}
          walletAddress={user.walletAddress}
        />
      </Suspense>

      {/* Zone D: Policies */}
      <Suspense fallback={<PolicyListSkeleton />}>
        <PolicySection userId={user.userId} chainId={chainId} />
      </Suspense>

      {/* Zone E: Activity Feed */}
      <Suspense fallback={<TransactionFeedSkeleton />}>
        <ActivitySection userId={user.userId} chainId={chainId} />
      </Suspense>

      {/* Bottom spacer for wallet browser tabs */}
      <div className="h-8" />
    </div>
  );
}

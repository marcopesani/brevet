import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { getInitialChainIdFromCookie } from "@/lib/chain-cookie";
import { getTransactions } from "@/lib/data/transactions";
import { TransactionTable } from "@/components/transaction-table";
import { TransactionsHeader } from "@/components/transactions-header";
import PendingPaymentList from "@/components/pending-payment-list";

export default async function TransactionsPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }

  const headersList = await headers();
  const cookieHeader = headersList.get("cookie");
  const initialChainId = getInitialChainIdFromCookie(cookieHeader);

  const transactions = await getTransactions(user.userId, { chainId: initialChainId });

  return (
    <div className="flex flex-col gap-6">
      {/* Pending Payments Section */}
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="text-lg font-semibold">Pending Payments</h3>
          <p className="text-sm text-muted-foreground">
            Review and approve payments requested by your MCP agent.
          </p>
        </div>
        <PendingPaymentList walletAddress={user.walletAddress} />
      </div>

      {/* Completed Transactions Section */}
      <div className="flex flex-col gap-6">
        <TransactionsHeader />
        <TransactionTable initialTransactions={transactions} />
      </div>
    </div>
  );
}

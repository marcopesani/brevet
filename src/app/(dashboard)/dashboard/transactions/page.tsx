import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Transactions",
};
import { getInitialChainIdFromCookie } from "@/lib/chain-cookie";
import { getTransactions } from "@/lib/data/transactions";
import { TransactionTable } from "@/components/transaction-table";
import { TransactionsHeader } from "@/components/transactions-header";

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
      <TransactionsHeader />
      <TransactionTable initialTransactions={transactions} />
    </div>
  );
}

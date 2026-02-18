import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { getTransactions } from "@/lib/data/transactions";
import { TransactionTable } from "@/components/transaction-table";
import { TransactionsHeader } from "@/components/transactions-header";

export default async function TransactionsPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }

  const transactions = await getTransactions(user.userId);

  return (
    <div className="flex flex-col gap-6">
      <TransactionsHeader />
      <TransactionTable initialTransactions={transactions} />
    </div>
  );
}

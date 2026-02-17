import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { getTransactions } from "@/lib/data/transactions";
import { TransactionTable } from "@/components/transaction-table";

export default async function TransactionsPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }

  const transactions = await getTransactions(user.userId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">Transaction History</h2>
        <p className="text-sm text-muted-foreground">
          View and filter all payments and withdrawals.
        </p>
      </div>
      <TransactionTable initialTransactions={transactions} />
    </div>
  );
}

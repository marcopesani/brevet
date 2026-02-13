import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { TransactionTable } from "@/components/transaction-table";

export default async function TransactionsPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">Transaction History</h2>
        <p className="text-sm text-muted-foreground">
          View and filter all payments and withdrawals.
        </p>
      </div>
      <TransactionTable />
    </div>
  );
}

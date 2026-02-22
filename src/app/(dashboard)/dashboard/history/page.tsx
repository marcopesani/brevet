import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { getTransactions } from "@/lib/data/transactions";

export const metadata: Metadata = {
  title: "History",
};
import { TransactionTable } from "@/components/transaction-table";

export default async function HistoryPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }

  const transactions = await getTransactions(user.userId);

  return <TransactionTable initialTransactions={transactions} />;
}

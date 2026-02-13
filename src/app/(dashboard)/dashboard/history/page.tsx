import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { TransactionTable } from "@/components/transaction-table";

export default async function HistoryPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }

  return <TransactionTable />;
}

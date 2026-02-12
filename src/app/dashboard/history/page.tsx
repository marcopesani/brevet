import { getAuthenticatedUser } from "@/lib/auth";
import TransactionList from "@/components/TransactionList";

export default async function HistoryPage() {
  const user = await getAuthenticatedUser();
  const userId = user!.userId;

  return <TransactionList userId={userId} />;
}

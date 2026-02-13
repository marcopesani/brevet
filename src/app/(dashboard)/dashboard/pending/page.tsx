import { getAuthenticatedUser } from "@/lib/auth";
import PendingPaymentList from "@/components/pending-payment-list";

export default async function PendingPage() {
  const user = await getAuthenticatedUser();
  const userId = user!.userId;
  const walletAddress = user!.walletAddress;

  return <PendingPaymentList userId={userId} walletAddress={walletAddress} />;
}

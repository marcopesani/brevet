import { getAuthenticatedUser } from "@/lib/auth";
import PendingPaymentList from "@/components/pending-payment-list";

export default async function PendingPage() {
  const user = await getAuthenticatedUser();
  const walletAddress = user!.walletAddress;

  return <PendingPaymentList walletAddress={walletAddress} />;
}

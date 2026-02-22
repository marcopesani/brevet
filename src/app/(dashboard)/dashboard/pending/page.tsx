import type { Metadata } from "next";
import { getAuthenticatedUser } from "@/lib/auth";
import PendingPaymentList from "@/components/pending-payment-list";
import { PendingPaymentsHeader } from "@/components/pending-payments-header";

export const metadata: Metadata = {
  title: "Pending Payments",
};

export default async function PendingPage() {
  const user = await getAuthenticatedUser();
  const walletAddress = user!.walletAddress;

  return (
    <div className="flex flex-col gap-6">
      <PendingPaymentsHeader />
      <PendingPaymentList walletAddress={walletAddress} />
    </div>
  );
}

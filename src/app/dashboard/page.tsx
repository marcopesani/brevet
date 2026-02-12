import { getAuthenticatedUser } from "@/lib/auth";
import HotWalletInfo from "@/components/HotWalletInfo";
import McpServerUrl from "@/components/McpServerUrl";
import SpendingSummary from "@/components/SpendingSummary";
import SpendingChart from "@/components/SpendingChart";
import EndpointPolicies from "@/components/EndpointPolicies";
import PendingPayments from "@/components/PendingPayments";

export default async function DashboardPage() {
  const user = await getAuthenticatedUser();
  const userId = user!.userId;
  const walletAddress = user!.walletAddress;

  return (
    <div className="flex flex-col gap-6">
      <McpServerUrl userId={userId} />
      <SpendingSummary userId={userId} />
      <SpendingChart userId={userId} />
      <HotWalletInfo />
      <PendingPayments userId={userId} walletAddress={walletAddress} />
      <EndpointPolicies userId={userId} />
    </div>
  );
}

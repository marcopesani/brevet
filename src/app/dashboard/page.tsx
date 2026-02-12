"use client";

import { useAppKitAccount } from "@reown/appkit/react";
import ConnectWallet from "@/components/ConnectWallet";
import SpendingPolicies from "@/components/SpendingPolicies";

export default function DashboardPage() {
  const { address, isConnected } = useAppKitAccount();

  if (!isConnected || !address) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="flex flex-col items-center gap-4">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            PayMCP Dashboard
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Connect your wallet to access the dashboard.
          </p>
          <ConnectWallet />
        </div>
      </div>
    );
  }

  // Use wallet address as userId for now
  const userId = address;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            PayMCP Dashboard
          </h1>
          <ConnectWallet />
        </div>

        <div className="flex flex-col gap-6">
          {/* Hot wallet section will be added by another task */}
          <SpendingPolicies userId={userId} />
        </div>
      </div>
    </div>
  );
}

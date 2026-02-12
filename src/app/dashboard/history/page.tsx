"use client";

import Link from "next/link";
import { useAppKitAccount } from "@reown/appkit/react";
import ConnectWallet from "@/components/ConnectWallet";
import TransactionList from "@/components/TransactionList";

export default function HistoryPage() {
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

        {/* Navigation */}
        <nav className="mb-6 flex gap-4 border-b border-zinc-200 dark:border-zinc-800">
          <Link
            href="/dashboard"
            className="border-b-2 border-transparent px-1 pb-2 text-sm text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            Wallet & Policies
          </Link>
          <Link
            href="/dashboard/history"
            className="border-b-2 border-black px-1 pb-2 text-sm font-medium text-black dark:border-zinc-50 dark:text-zinc-50"
          >
            History
          </Link>
        </nav>

        <TransactionList userId={userId} />
      </div>
    </div>
  );
}

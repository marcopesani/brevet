"use client";

import { useMcpApp } from "@/app/hooks/use-mcp-app";

interface WalletData {
  walletAddress: string | null;
  hotWalletAddress: string;
  network: string;
  usdcBalance: string;
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function WalletPage() {
  const { toolResult, toolInput, connected } = useMcpApp();
  const data = (toolResult ?? toolInput) as WalletData | null;

  if (!connected) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-zinc-950">
        <p className="text-sm text-zinc-400 dark:text-zinc-500">
          Connecting to MCP host...
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-zinc-950">
        <p className="text-sm text-zinc-400 dark:text-zinc-500">
          Waiting for wallet data...
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-zinc-950">
      <main className="w-full max-w-md px-6 py-8">
        <h1 className="mb-6 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          x402 Wallet
        </h1>
        <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Connected Wallet
            </p>
            <p className="mt-1 font-mono text-sm text-zinc-900 dark:text-zinc-100">
              {data.walletAddress
                ? truncateAddress(data.walletAddress)
                : "Not connected"}
            </p>
          </div>
          <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Hot Wallet
            </p>
            <p className="mt-1 font-mono text-sm text-zinc-900 dark:text-zinc-100">
              {truncateAddress(data.hotWalletAddress)}
            </p>
          </div>
          <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Network
            </p>
            <p className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
              {data.network}
            </p>
          </div>
          <div className="px-4 py-3">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              USDC Balance
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
              {parseFloat(data.usdcBalance).toFixed(2)}{" "}
              <span className="text-sm font-normal text-zinc-500 dark:text-zinc-400">
                USDC
              </span>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

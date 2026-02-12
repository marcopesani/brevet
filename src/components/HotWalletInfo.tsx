"use client";

import { useCallback, useEffect, useState } from "react";

export default function HotWalletInfo() {
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBalance = useCallback(async () => {
    try {
      const res = await fetch("/api/wallet/balance");
      if (res.ok) {
        const data = await res.json();
        setAddress(data.address);
        setBalance(data.balance);
      }
    } catch {
      // Non-critical — will retry
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBalance();
    const interval = setInterval(fetchBalance, 15_000);
    return () => clearInterval(interval);
  }, [fetchBalance]);

  if (loading) {
    return (
      <div className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">Loading wallet...</p>
      </div>
    );
  }

  if (!address) {
    return (
      <div className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">No hot wallet found.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
      <h2 className="mb-4 text-lg font-semibold text-black dark:text-zinc-50">
        Hot Wallet
      </h2>
      <div className="space-y-2">
        <div>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Address
          </p>
          <p className="break-all font-mono text-sm text-zinc-900 dark:text-zinc-100">
            {address}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            USDC Balance
          </p>
          <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            {balance !== null ? `$${balance}` : "Loading..."}
          </p>
        </div>
      </div>
    </div>
  );
}

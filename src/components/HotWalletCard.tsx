"use client";

import { useEffect, useState, useCallback } from "react";
import { useAccount } from "wagmi";
import FundWallet from "./FundWallet";
import WithdrawWallet from "./WithdrawWallet";

export default function HotWalletCard() {
  const { address, isConnected } = useAccount();
  const [hotWalletAddress, setHotWalletAddress] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceUnavailable, setBalanceUnavailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async (addr: string) => {
    try {
      const res = await fetch(`/api/wallet/balance?address=${addr}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setBalance(data.balance);
        setBalanceUnavailable(false);
      } else if (res.status === 503) {
        // RPC rate limited (e.g. public Base RPC); show message and retry on next interval
        setBalanceUnavailable(true);
      }
    } catch {
      // Balance fetch is non-critical; silently retry on next interval
    }
  }, []);

  useEffect(() => {
    if (!isConnected || !address) {
      setHotWalletAddress(null);
      setBalance(null);
      return;
    }

    let cancelled = false;

    async function createWallet() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/wallet/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress: address }),
        });

        if (!res.ok) {
          throw new Error("Failed to create hot wallet");
        }

        const data = await res.json();
        if (!cancelled) {
          setHotWalletAddress(data.address);
          setUserId(data.userId);
          fetchBalance(data.address);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    createWallet();

    return () => {
      cancelled = true;
    };
  }, [isConnected, address, fetchBalance]);

  // Refresh balance every 30 seconds (avoid hitting public RPC rate limits)
  useEffect(() => {
    if (!hotWalletAddress) return;
    const interval = setInterval(() => fetchBalance(hotWalletAddress), 30_000);
    return () => clearInterval(interval);
  }, [hotWalletAddress, fetchBalance]);

  if (!isConnected) return null;

  if (loading) {
    return (
      <div className="w-full rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">Creating hot wallet...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full rounded-xl border border-red-200 p-6 dark:border-red-900">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  if (!hotWalletAddress) return null;

  return (
    <div className="w-full rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
      <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Hot Wallet
      </h2>

      <div className="mb-4 space-y-2">
        <div>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Address
          </p>
          <p className="break-all font-mono text-sm text-zinc-900 dark:text-zinc-100">
            {hotWalletAddress}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            USDC Balance
          </p>
          <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            {balanceUnavailable
              ? "Temporarily unavailable"
              : balance !== null
                ? `$${balance}`
                : "Loading..."}
          </p>
        </div>
      </div>

      <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <h3 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Fund Hot Wallet
        </h3>
        <FundWallet
          hotWalletAddress={hotWalletAddress}
          onFunded={() => fetchBalance(hotWalletAddress)}
        />
      </div>

      {userId && (
        <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <h3 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Withdraw to Wallet
          </h3>
          <WithdrawWallet
            userId={userId}
            balance={balance}
            onWithdrawn={() => fetchBalance(hotWalletAddress)}
          />
        </div>
      )}
    </div>
  );
}

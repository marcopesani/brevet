"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { chainConfig } from "@/lib/chain-config";

export default function WithdrawWallet({
  userId,
  balance,
  onWithdrawn,
}: {
  userId: string;
  balance: string | null;
  onWithdrawn?: () => void;
}) {
  const { address } = useAccount();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  function handleMax() {
    if (balance) {
      setAmount(balance);
    }
  }

  async function handleWithdraw() {
    if (!amount || parseFloat(amount) <= 0 || !address) return;

    setLoading(true);
    setError(null);
    setTxHash(null);

    try {
      const res = await fetch("/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          amount: parseFloat(amount),
          toAddress: address,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Withdrawal failed");
      }

      setTxHash(data.txHash);
      setAmount("");
      onWithdrawn?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Withdrawal failed");
    } finally {
      setLoading(false);
    }
  }

  if (!address) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="number"
            placeholder="USDC amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="0"
            step="0.01"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 pr-14 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <button
            type="button"
            onClick={handleMax}
            disabled={!balance || balance === "0"}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600 hover:bg-zinc-300 disabled:opacity-50 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
          >
            Max
          </button>
        </div>
        <button
          onClick={handleWithdraw}
          disabled={loading || !amount || parseFloat(amount) <= 0}
          className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
        >
          {loading ? "Withdrawing..." : "Withdraw"}
        </button>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        To: {address.slice(0, 6)}...{address.slice(-4)}
      </p>
      {error && (
        <p className="text-xs text-red-500">
          {error.length > 100 ? error.slice(0, 100) + "..." : error}
        </p>
      )}
      {txHash && (
        <p className="text-xs text-green-600">
          Withdrawn successfully!{" "}
          <a
            href={`${chainConfig.explorerUrl}/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            View on BaseScan
          </a>
        </p>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";

interface Transaction {
  id: string;
  amount: number;
  endpoint: string;
  txHash: string | null;
  network: string;
  status: string;
  type: string;
  userId: string;
  createdAt: string;
}

interface TransactionDetailProps {
  transaction: Transaction;
}

interface VerificationResult {
  verified: boolean;
  blockNumber?: number;
  confirmations?: number;
  status?: string;
  error?: string;
}

function statusColor(status: string): string {
  switch (status) {
    case "confirmed":
    case "completed":
      return "text-green-600 dark:text-green-400";
    case "pending":
      return "text-yellow-600 dark:text-yellow-400";
    case "failed":
      return "text-red-600 dark:text-red-400";
    default:
      return "text-zinc-600 dark:text-zinc-400";
  }
}

function typeLabel(type: string): string {
  switch (type) {
    case "payment":
      return "Payment";
    case "withdrawal":
      return "Withdrawal";
    case "funding":
      return "Funding";
    default:
      return type;
  }
}

function typeBadgeColor(type: string): string {
  switch (type) {
    case "payment":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300";
    case "withdrawal":
      return "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300";
    case "funding":
      return "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300";
    default:
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncateHash(hash: string): string {
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

export default function TransactionDetail({
  transaction,
}: TransactionDetailProps) {
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  async function handleVerify() {
    setVerifying(true);
    try {
      const res = await fetch(`/api/transactions/${transaction.id}/verify`, {
        method: "POST",
      });
      const data = await res.json();
      setVerification(data);
    } catch {
      setVerification({ verified: false, error: "Network error" });
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="flex flex-col gap-1 rounded border border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-black dark:text-zinc-50">
            ${transaction.amount.toFixed(2)} USDC
          </span>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${typeBadgeColor(transaction.type)}`}
          >
            {typeLabel(transaction.type)}
          </span>
        </div>
        <span className={`text-xs font-medium capitalize ${statusColor(transaction.status)}`}>
          {transaction.status}
        </span>
      </div>

      <p className="truncate text-xs text-zinc-600 dark:text-zinc-400">
        {transaction.endpoint}
      </p>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          {formatDate(transaction.createdAt)}
        </span>
        {transaction.txHash ? (
          <a
            href={`https://basescan.org/tx/${transaction.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            {truncateHash(transaction.txHash)}
          </a>
        ) : (
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            No tx hash
          </span>
        )}
      </div>

      {/* Verification section */}
      {transaction.txHash && (
        <div className="mt-1 flex items-center gap-2">
          {!verification ? (
            <button
              type="button"
              onClick={handleVerify}
              disabled={verifying}
              className="rounded bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              {verifying ? "Verifying..." : "Verify on-chain"}
            </button>
          ) : verification.verified ? (
            <span className="text-[11px] text-green-600 dark:text-green-400">
              Confirmed (block {verification.blockNumber}, {verification.confirmations} confirmations)
            </span>
          ) : (
            <span className="text-[11px] text-red-600 dark:text-red-400">
              {verification.error ?? "Not confirmed on-chain"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

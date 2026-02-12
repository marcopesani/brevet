"use client";

interface Transaction {
  id: string;
  amount: number;
  endpoint: string;
  txHash: string | null;
  network: string;
  status: string;
  userId: string;
  createdAt: string;
}

interface TransactionDetailProps {
  transaction: Transaction;
}

function statusColor(status: string): string {
  switch (status) {
    case "confirmed":
      return "text-green-600 dark:text-green-400";
    case "pending":
      return "text-yellow-600 dark:text-yellow-400";
    case "failed":
      return "text-red-600 dark:text-red-400";
    default:
      return "text-zinc-600 dark:text-zinc-400";
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
  return (
    <div className="flex flex-col gap-1 rounded border border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-black dark:text-zinc-50">
          ${transaction.amount.toFixed(2)} USDC
        </span>
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
    </div>
  );
}

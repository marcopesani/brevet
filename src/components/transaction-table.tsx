"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ExternalLink, FileJson } from "lucide-react";
import { getTransactions } from "@/app/actions/transactions";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Transaction {
  id: string;
  amount: number;
  endpoint: string;
  txHash: string | null;
  network: string;
  status: string;
  type: string;
  createdAt: string | Date;
  responsePayload: string | null;
}

interface TransactionTableProps {
  initialTransactions: Transaction[];
}

function getExplorerUrl(network: string): string {
  if (network === "eip155:84532") {
    return "https://sepolia.basescan.org";
  }
  return "https://basescan.org";
}

function formatDate(dateStr: string | Date): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAmount(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function truncateHash(hash: string): string {
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "completed":
    case "confirmed":
      return (
        <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 border-transparent">
          {status}
        </Badge>
      );
    case "failed":
      return (
        <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 border-transparent">
          {status}
        </Badge>
      );
    case "pending":
      return (
        <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300 border-transparent">
          {status}
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function TypeBadge({ type }: { type: string }) {
  switch (type) {
    case "payment":
      return (
        <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 border-transparent">
          Payment
        </Badge>
      );
    case "withdrawal":
      return (
        <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 border-transparent">
          Withdrawal
        </Badge>
      );
    default:
      return <Badge variant="secondary">{type}</Badge>;
  }
}

function JsonViewer({ data }: { data: string }) {
  let parsed: unknown;
  let isJson = false;
  try {
    parsed = JSON.parse(data);
    isJson = true;
  } catch {
    // not valid JSON
  }

  if (!isJson) {
    return (
      <pre className="text-sm font-mono whitespace-pre-wrap break-words">
        {data}
      </pre>
    );
  }

  const formatted = JSON.stringify(parsed, null, 2);
  return (
    <pre className="text-sm font-mono whitespace-pre-wrap break-words">
      {formatted.split("\n").map((line, i) => {
        // Color-code JSON tokens with Tailwind classes
        const colored = line
          .replace(
            /^(\s*)("(?:[^"\\]|\\.)*")(\s*:\s*)/,
            '$1<span class="text-blue-600 dark:text-blue-400">$2</span>$3'
          )
          .replace(
            /:\s*("(?:[^"\\]|\\.)*")/g,
            (match, str) =>
              match.replace(
                str,
                `<span class="text-green-600 dark:text-green-400">${str}</span>`
              )
          )
          .replace(
            /:\s*(-?\d+\.?\d*(?:[eE][+-]?\d+)?)/g,
            (match, num) =>
              match.replace(
                num,
                `<span class="text-amber-600 dark:text-amber-400">${num}</span>`
              )
          )
          .replace(
            /:\s*(true|false)/g,
            (match, bool) =>
              match.replace(
                bool,
                `<span class="text-purple-600 dark:text-purple-400">${bool}</span>`
              )
          )
          .replace(
            /:\s*(null)/g,
            (match, n) =>
              match.replace(
                n,
                `<span class="text-muted-foreground italic">${n}</span>`
              )
          );
        return (
          <span
            key={i}
            dangerouslySetInnerHTML={{ __html: colored + "\n" }}
          />
        );
      })}
    </pre>
  );
}

function TransactionDetailSheet({
  transaction,
  onClose,
}: {
  transaction: Transaction | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!transaction} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>Response Details</SheetTitle>
          {transaction && (
            <SheetDescription
              className="truncate"
              title={transaction.endpoint}
            >
              {transaction.endpoint}
            </SheetDescription>
          )}
        </SheetHeader>
        {transaction && (
          <>
            <div className="flex flex-wrap gap-2 px-4">
              <Badge variant="outline" className="font-medium">
                {formatAmount(transaction.amount)}
              </Badge>
              <StatusBadge status={transaction.status} />
              <TypeBadge type={transaction.type} />
              <Badge variant="outline" className="text-muted-foreground">
                {formatDate(transaction.createdAt)}
              </Badge>
              {transaction.txHash && (
                <a
                  href={`${getExplorerUrl(transaction.network)}/tx/${transaction.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1"
                >
                  <Badge
                    variant="outline"
                    className="text-blue-600 dark:text-blue-400 cursor-pointer hover:bg-muted"
                  >
                    {truncateHash(transaction.txHash)}
                    <ExternalLink className="size-3 ml-1" />
                  </Badge>
                </a>
              )}
            </div>
            <ScrollArea className="flex-1 min-h-0 px-4 pb-4">
              <div className="rounded-md border bg-muted/30 p-4 overflow-x-auto">
                <JsonViewer data={transaction.responsePayload ?? ""} />
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function TransactionTable({ initialTransactions }: TransactionTableProps) {
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [isPending, startTransition] = useTransition();
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(0);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);

  useEffect(() => {
    if (!since && !until) {
      setTransactions(initialTransactions);
      return;
    }

    startTransition(async () => {
      const sinceParam = since ? new Date(since).toISOString() : undefined;
      let untilParam: string | undefined;
      if (until) {
        const untilDate = new Date(until);
        untilDate.setHours(23, 59, 59, 999);
        untilParam = untilDate.toISOString();
      }
      const data = await getTransactions(sinceParam, untilParam);
      setTransactions(data);
    });
  }, [since, until, initialTransactions]);

  // Reset to first page when filters or page size change
  useEffect(() => {
    setCurrentPage(0);
  }, [since, until, pageSize]);

  const sorted = useMemo(() => {
    return [...transactions].sort((a, b) => {
      const diff =
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortDir === "asc" ? diff : -diff;
    });
  }, [transactions, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paged = sorted.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Date range filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-since">From</Label>
          <Input
            id="filter-since"
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            className="w-auto"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-until">To</Label>
          <Input
            id="filter-until"
            type="date"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            className="w-auto"
          />
        </div>
        {(since || until) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSince("");
              setUntil("");
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {/* Table */}
      {isPending ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Loading transactions…
        </p>
      ) : transactions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center border rounded-lg">
          <p className="text-sm text-muted-foreground">
            No transactions found
          </p>
          <p className="text-xs text-muted-foreground/70">
            Payments made through your MCP server will appear here.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <button
                      type="button"
                      className="flex items-center gap-1 hover:text-foreground"
                      onClick={() =>
                        setSortDir((d) => (d === "desc" ? "asc" : "desc"))
                      }
                    >
                      Date {sortDir === "desc" ? "↓" : "↑"}
                    </button>
                  </TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tx Hash</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((tx) => {
                  const hasResponse = tx.responsePayload !== null;
                  return (
                    <TableRow
                      key={tx.id}
                      className={
                        hasResponse
                          ? "cursor-pointer hover:bg-muted/50"
                          : undefined
                      }
                      onClick={
                        hasResponse
                          ? () => setSelectedTransaction(tx)
                          : undefined
                      }
                    >
                      <TableCell className="text-muted-foreground">
                        {formatDate(tx.createdAt)}
                      </TableCell>
                      <TableCell
                        className="truncate flex items-center justify-right gap-2"
                        title={tx.endpoint}
                      >
                        <FileJson className={cn("size-3.5 flex-shrink-0", hasResponse ? "opacity-100" : "opacity-25")} />
                        <span className="flex-1 truncate">{tx.endpoint}</span>
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatAmount(tx.amount)}
                      </TableCell>
                      <TableCell>
                        <TypeBadge type={tx.type} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={tx.status} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {tx.txHash ? (
                            <a
                              href={`${getExplorerUrl(tx.network)}/tx/${tx.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {truncateHash(tx.txHash)}
                              <ExternalLink className="size-3" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Rows per page</span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => setPageSize(Number(v))}
              >
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Page {currentPage + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 0}
                onClick={() => setCurrentPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages - 1}
                onClick={() => setCurrentPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
      <TransactionDetailSheet
        transaction={selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
      />
    </div>
  );
}

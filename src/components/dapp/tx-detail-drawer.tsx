"use client";

import { useState, useMemo } from "react";
import { Copy, Check, ExternalLink, X, Clock } from "lucide-react";
import { toast } from "sonner";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getChainById, getDefaultChainConfig } from "@/lib/chain-config";
import { cn } from "@/lib/utils";

interface Transaction {
  id: string;
  amount: number;
  endpoint: string;
  txHash: string | null;
  network: string;
  chainId: number;
  status: string;
  type: string;
  errorMessage: string | null;
  responseStatus: number | null;
  createdAt: string;
  updatedAt: string;
  responsePayload?: string | null;
}

interface TxDetailDrawerProps {
  transaction: Transaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TxDetailDrawer({
  transaction,
  open,
  onOpenChange,
}: TxDetailDrawerProps) {
  const [copied, setCopied] = useState<string | null>(null);

  if (!transaction) return null;

  const chainConfig = getChainById(transaction.chainId) ?? getDefaultChainConfig();

  async function handleCopy(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success(`${label} copied`);
    setTimeout(() => setCopied(null), 2000);

    // Haptic feedback
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(10);
    }
  }

  const truncatedHash = transaction.txHash
    ? `${transaction.txHash.slice(0, 10)}...${transaction.txHash.slice(-8)}`
    : null;

  const truncatedEndpoint = useMemo(() => {
    if (transaction.endpoint.length > 40) {
      return transaction.endpoint.slice(0, 40) + "...";
    }
    return transaction.endpoint;
  }, [transaction.endpoint]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Transaction Details
          </DrawerTitle>
        </DrawerHeader>

        <div className="space-y-6 px-4 pb-6">
          {/* Amount - Prominent */}
          <div className="text-center">
            <p className={cn(
              "text-3xl font-bold",
              transaction.type === "withdrawal"
                ? "text-amber-600 dark:text-amber-400"
                : ""
            )}>
              {transaction.type === "withdrawal" ? "-" : ""}
              ${transaction.amount.toFixed(2)} USDC
            </p>
            <div className="mt-2 flex items-center justify-center gap-2">
              <Badge
                variant={
                  transaction.status === "completed"
                    ? "default"
                    : transaction.status === "failed"
                      ? "destructive"
                      : "outline"
                }
              >
                {transaction.status === "completed"
                  ? "Confirmed"
                  : transaction.status === "failed"
                    ? "Failed"
                    : "Pending"}
              </Badge>
              <Badge variant="outline">{chainConfig.displayName}</Badge>
            </div>
          </div>

          {/* Details */}
          <div className="space-y-3">
            {/* Endpoint */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Endpoint</p>
              <div className="flex items-center gap-2 rounded-lg border bg-muted p-3">
                <span className="flex-1 break-all text-sm">{transaction.endpoint}</span>
              </div>
            </div>

            {/* Transaction Hash */}
            {transaction.txHash && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Transaction Hash</p>
                <div className="flex items-center gap-2 rounded-lg border bg-muted p-3">
                  <code className="flex-1 text-sm">{truncatedHash}</code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => handleCopy(transaction.txHash!, "Hash")}
                  >
                    {copied === "Hash" ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <a
                    href={`${chainConfig.explorerUrl}/tx/${transaction.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>
            )}

            {/* Timestamps */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted p-3">
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="text-sm">
                  {new Date(transaction.createdAt).toLocaleString()}
                </p>
              </div>
              {transaction.updatedAt !== transaction.createdAt && (
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Updated</p>
                  <p className="text-sm">
                    {new Date(transaction.updatedAt).toLocaleString()}
                  </p>
                </div>
              )}
            </div>

            {/* Error message */}
            {transaction.errorMessage && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-xs text-muted-foreground">Error</p>
                <p className="text-sm text-destructive">{transaction.errorMessage}</p>
              </div>
            )}

            {/* Response payload preview (truncated) */}
            {transaction.responsePayload && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Response</p>
                <div className="max-h-24 overflow-y-auto rounded-lg bg-muted p-3">
                  <code className="text-xs break-all">
                    {transaction.responsePayload.slice(0, 200)}
                    {transaction.responsePayload.length > 200 ? "..." : ""}
                  </code>
                </div>
              </div>
            )}
          </div>

          {/* Close button */}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

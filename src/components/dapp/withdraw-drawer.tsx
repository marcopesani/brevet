"use client";

import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getChainConfig, getDefaultChainConfig } from "@/lib/chain-config";
import { withdrawFromWallet } from "@/app/actions/wallet";
import { WALLET_BALANCE_QUERY_KEY } from "@/hooks/use-wallet-balance";

interface WithdrawDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  balance?: string;
  chainId?: number;
  smartAccountAddress?: string;
  walletAddress?: string;
}

export function WithdrawDrawer({
  open,
  onOpenChange,
  balance,
  chainId,
  smartAccountAddress,
  walletAddress,
}: WithdrawDrawerProps) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [isPending, startTransition] = useTransition();
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chainConfig = chainId
    ? getChainConfig(chainId) ?? getDefaultChainConfig()
    : getDefaultChainConfig();
  const explorerName = chainConfig.explorerUrl
    .replace("https://", "")
    .split("/")[0];

  // Reset state when drawer opens
  useState(() => {
    if (open) {
      setAmount("");
      setTxHash(null);
      setError(null);
    }
  });

  function handleMax() {
    if (balance) setAmount(balance);
  }

  async function handleWithdraw() {
    if (!amount || parseFloat(amount) <= 0 || !walletAddress) return;

    setError(null);

    startTransition(async () => {
      try {
        const result = await withdrawFromWallet(
          parseFloat(amount),
          walletAddress,
          chainId,
        );
        setTxHash(result.txHash);
        setAmount("");
        queryClient.invalidateQueries({ queryKey: WALLET_BALANCE_QUERY_KEY });
        toast.success("Withdrawal successful");

        // Haptic feedback
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate([10, 50, 10]);
        }

        // Close after brief delay
        setTimeout(() => {
          onOpenChange(false);
        }, 1500);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Withdrawal failed");
        toast.error(err instanceof Error ? err.message : "Withdrawal failed");
      }
    });
  }

  const isSuccess = !!txHash;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            <ArrowUpRight className="h-5 w-5" />
            Withdraw
          </DrawerTitle>
        </DrawerHeader>
        <div className="space-y-4 px-4 pb-6">
          {/* Amount input */}
          <div className="space-y-2">
            <Label htmlFor="withdraw-amount">Amount (USDC)</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  id="withdraw-amount"
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min="0"
                  step="0.01"
                  disabled={isPending}
                  className="pl-7"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleMax}
                disabled={!balance || balance === "0" || isPending}
                className="shrink-0"
              >
                Max
              </Button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
              <p className="text-sm text-destructive">
                {error.length > 100 ? error.slice(0, 100) + "..." : error}
              </p>
            </div>
          )}

          {/* Success */}
          {isSuccess && (
            <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-4">
              <p className="font-medium text-green-600 dark:text-green-400">
                Withdrawn successfully!
              </p>
              <a
                href={`${chainConfig.explorerUrl}/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-sm text-green-600 hover:underline dark:text-green-400"
              >
                View on {explorerName}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          {/* Balance info */}
          <div className="flex items-center justify-between rounded-lg bg-muted p-3">
            <span className="text-sm text-muted-foreground">Available</span>
            <span className="font-medium">${balance ?? "0"} USDC</span>
          </div>

          {/* Destination */}
          <div className="rounded-lg bg-muted p-3">
            <p className="text-xs text-muted-foreground">To (your wallet)</p>
            <p className="font-mono text-sm">
              {walletAddress
                ? `${walletAddress.slice(0, 8)}...${walletAddress.slice(-6)}`
                : "Connect wallet"}
            </p>
          </div>

          {/* Action */}
          {isSuccess ? (
            <Button
              variant="outline"
              onClick={() => {
                setTxHash(null);
                setAmount("");
              }}
              className="w-full"
            >
              Withdraw More
            </Button>
          ) : (
            <Button
              onClick={handleWithdraw}
              disabled={isPending || !amount || parseFloat(amount) <= 0 || !walletAddress}
              className="w-full"
            >
              {isPending ? "Processing..." : "Withdraw"}
            </Button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

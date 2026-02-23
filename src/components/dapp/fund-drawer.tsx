"use client";

import { useState, useEffect } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useSwitchChain } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { parseUnits } from "viem";
import { toast } from "sonner";
import { ExternalLink, ArrowDownLeft } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getChainById, getDefaultChainConfig, getUsdcConfig } from "@/lib/chain-config";
import { WALLET_BALANCE_QUERY_KEY } from "@/hooks/use-wallet-balance";

const ERC20_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

interface FundDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountAddress?: string;
  chainId?: number;
  explorerUrl?: string;
}

export function FundDrawer({
  open,
  onOpenChange,
  accountAddress,
  chainId,
  explorerUrl,
}: FundDrawerProps) {
  const [amount, setAmount] = useState("");
  const queryClient = useQueryClient();

  const { chainId: walletChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const chainConfig = chainId ? getChainById(chainId) ?? getDefaultChainConfig() : getDefaultChainConfig();
  const usdcDecimals = getUsdcConfig(chainConfig.chain.id)?.decimals ?? 6;

  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Reset when drawer opens
  useEffect(() => {
    if (open) {
      setAmount("");
      reset();
    }
  }, [open, reset]);

  // Invalidate balance on success
  useEffect(() => {
    if (isSuccess) {
      queryClient.invalidateQueries({ queryKey: WALLET_BALANCE_QUERY_KEY });
      toast.success("Funds deposited successfully");

      // Haptic feedback
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([10, 50, 10]);
      }

      // Close drawer after brief delay to show success
      setTimeout(() => {
        onOpenChange(false);
      }, 1500);
    }
  }, [isSuccess, queryClient, onOpenChange]);

  async function handleFund() {
    if (!accountAddress || !amount || parseFloat(amount) <= 0) return;

    if (walletChainId !== chainConfig.chain.id) {
      try {
        await switchChainAsync({ chainId: chainConfig.chain.id });
      } catch {
        toast.error("Failed to switch network");
        return;
      }
    }

    writeContract({
      address: chainConfig.usdcAddress,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [
        accountAddress as `0x${string}`,
        parseUnits(amount, usdcDecimals),
      ],
    });
  }

  const statusText = isPending
    ? "Confirm in your wallet..."
    : isConfirming
      ? "Confirming transaction..."
      : null;

  const explorerName = explorerUrl
    ? explorerUrl.replace("https://", "").split("/")[0]
    : "Explorer";

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            <ArrowDownLeft className="h-5 w-5" />
            Fund Account
          </DrawerTitle>
        </DrawerHeader>
        <div className="space-y-4 px-4 pb-6">
          {/* Amount input */}
          <div className="space-y-2">
            <Label htmlFor="fund-amount">Amount (USDC)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                id="fund-amount"
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0"
                step="0.01"
                disabled={isPending || isConfirming}
                className="pl-7"
              />
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
              <p className="text-sm text-destructive">
                {error.message.length > 100
                  ? error.message.slice(0, 100) + "..."
                  : error.message}
              </p>
            </div>
          )}

          {/* Status / Success */}
          {isSuccess && txHash ? (
            <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-4">
              <p className="font-medium text-green-600 dark:text-green-400">
                Funded successfully!
              </p>
              <a
                href={`${explorerUrl}/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-sm text-green-600 hover:underline dark:text-green-400"
              >
                View on {explorerName}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          ) : statusText ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              {statusText}
            </div>
          ) : null}

          {/* Destination info */}
          <div className="rounded-lg bg-muted p-3">
            <p className="text-xs text-muted-foreground">To</p>
            <p className="font-mono text-sm">
              {accountAddress
                ? `${accountAddress.slice(0, 8)}...${accountAddress.slice(-6)}`
                : "No account"}
            </p>
          </div>

          {/* Action button */}
          {isSuccess ? (
            <Button
              variant="outline"
              onClick={() => {
                reset();
                setAmount("");
              }}
              className="w-full"
            >
              Fund More
            </Button>
          ) : (
            <Button
              onClick={handleFund}
              disabled={!accountAddress || isPending || isConfirming || !amount || parseFloat(amount) <= 0}
              className="w-full"
            >
              {isPending
                ? "Confirm in wallet..."
                : isConfirming
                  ? "Confirming..."
                  : "Fund Account"}
            </Button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

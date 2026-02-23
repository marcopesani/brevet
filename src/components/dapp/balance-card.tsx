"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Check, Plus, Minus, Wallet, Shield, Key, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWalletBalance } from "@/hooks/use-wallet-balance";
import { AnimatedCounter } from "./animated-counter";
import { FundDrawer } from "./fund-drawer";
import { WithdrawDrawer } from "./withdraw-drawer";
import { SetupDrawer } from "./setup-drawer";
import { getChainById } from "@/lib/chain-config";

interface BalanceCardProps {
  initialBalance: string;
  address?: string;
  sessionKeyStatus?: string;
  chainId: number;
  hasSmartAccount: boolean;
  walletAddress?: string;
}

export function BalanceCard({
  initialBalance,
  address,
  sessionKeyStatus,
  chainId,
  hasSmartAccount,
  walletAddress,
}: BalanceCardProps) {
  const [copied, setCopied] = useState(false);
  const [fundDrawerOpen, setFundDrawerOpen] = useState(false);
  const [withdrawDrawerOpen, setWithdrawDrawerOpen] = useState(false);
  const [setupDrawerOpen, setSetupDrawerOpen] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const prevBalanceRef = useRef(initialBalance);

  const {
    balance: liveBalance,
    isLoading: balanceLoading,
    error: balanceError,
  } = useWalletBalance(!!address, address ? { balance: initialBalance, address } : undefined, chainId);

  const displayBalance = liveBalance ?? initialBalance;
  const chainConfig = getChainById(chainId);

  // Pulse animation on balance change
  useEffect(() => {
    if (liveBalance && liveBalance !== prevBalanceRef.current) {
      setPulseKey((k) => k + 1);
      prevBalanceRef.current = liveBalance;
    }
  }, [liveBalance]);

  async function handleCopyAddress() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    toast.success("Address copied");

    // Haptic feedback
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(10);
    }

    setTimeout(() => setCopied(false), 2000);
  }

  const truncatedAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : "";

  // State: No smart account
  if (!hasSmartAccount) {
    return (
      <>
        <div className="rounded-xl border bg-card p-6">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Wallet className="h-5 w-5" />
            <span className="text-sm">No Smart Account</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Create a smart account to start making AI agent payments.
          </p>
          <Button
            className="mt-4 w-full"
            onClick={() => setSetupDrawerOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Set Up Account
          </Button>
        </div>
        <SetupDrawer
          open={setupDrawerOpen}
          onOpenChange={setSetupDrawerOpen}
          chainId={chainId}
        />
      </>
    );
  }

  // State: Pending grant
  const isPendingGrant = sessionKeyStatus === "pending_grant";

  return (
    <>
      <div className="rounded-xl border bg-card p-6">
        {/* Header with chain and session status */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wallet className="h-4 w-4" />
            <span>Smart Account</span>
          </div>
          {sessionKeyStatus && (
            <Badge
              variant={isPendingGrant ? "outline" : "default"}
              className={`text-xs ${
                isPendingGrant
                  ? "border-amber-500/50 text-amber-500"
                  : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
              }`}
            >
              {isPendingGrant ? (
                <>
                  <AlertCircle className="mr-1 h-3 w-3" />
                  Needs Authorization
                </>
              ) : (
                <>
                  <Shield className="mr-1 h-3 w-3" />
                  Active
                </>
              )}
            </Badge>
          )}
        </div>

        {/* Balance with animation */}
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">USDC Balance</p>
          <div
            key={pulseKey}
            className={`flex items-baseline gap-2 ${pulseKey > 0 ? "animate-balance-pulse" : ""}`}
          >
            <span className="text-4xl font-bold">
              {balanceError ? (
                <span className="text-destructive text-lg">Error</span>
              ) : balanceLoading && !liveBalance ? (
                <span className="text-2xl">...</span>
              ) : (
                <>
                  <span className="text-2xl text-muted-foreground">$</span>
                  <AnimatedCounter value={displayBalance} />
                </>
              )}
            </span>
            <span className="text-sm text-muted-foreground">USDC</span>
          </div>
        </div>

        {/* Address with copy */}
        {address && (
          <button
            onClick={handleCopyAddress}
            className="mt-4 flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="font-mono">{truncatedAddress}</span>
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        )}

        {/* Action buttons */}
        <div className="mt-4 flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setFundDrawerOpen(true)}
            disabled={!address}
          >
            <Plus className="mr-1 h-4 w-4" />
            Fund
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setWithdrawDrawerOpen(true)}
            disabled={!address || parseFloat(displayBalance) <= 0}
          >
            <Minus className="mr-1 h-4 w-4" />
            Withdraw
          </Button>
        </div>

        {/* Session key authorization prompt */}
        {isPendingGrant && (
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <div className="flex items-start gap-2">
              <Key className="mt-0.5 h-4 w-4 text-amber-500" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-500">
                  Authorize Session Key
                </p>
                <p className="text-xs text-muted-foreground">
                  Required for AI agents to make payments on your behalf.
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setSetupDrawerOpen(true)}
              >
                Authorize
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Drawers */}
      <FundDrawer
        open={fundDrawerOpen}
        onOpenChange={setFundDrawerOpen}
        accountAddress={address}
        chainId={chainId}
        explorerUrl={chainConfig?.explorerUrl ?? "https://basescan.org"}
      />
      <WithdrawDrawer
        open={withdrawDrawerOpen}
        onOpenChange={setWithdrawDrawerOpen}
        balance={displayBalance}
        chainId={chainId}
        smartAccountAddress={address}
        walletAddress={walletAddress}
      />
      <SetupDrawer
        open={setupDrawerOpen}
        onOpenChange={setSetupDrawerOpen}
        chainId={chainId}
        smartAccountAddress={address}
        sessionKeyStatus={sessionKeyStatus}
      />
    </>
  );
}

"use client";

import { useMemo, useState, useEffect } from "react";
import { Clock, X, AlertCircle, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SlideToAction } from "./slide-to-action";
import { usePaymentSigning, type PendingPayment } from "@/hooks/use-payment-signing";
import { useChain } from "@/contexts/chain-context";
import { formatAmountForDisplay } from "@/lib/x402/display";
import { getRequirementAmount } from "@/lib/x402/requirements";
import type { PaymentRequirements } from "@x402/core/types";

interface PendingSlideCardProps {
  payment: PendingPayment;
  walletAddress: string;
  onComplete: () => void;
}

function useCountdown(expiresAt: string) {
  const [remaining, setRemaining] = useState(() => {
    return Math.max(0, new Date(expiresAt).getTime() - Date.now());
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      setRemaining(Math.max(0, ms));
      if (ms <= 0) clearInterval(interval);
    }, 1_000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return remaining;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Expired";
  const totalSeconds = Math.floor(ms / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function getUrgencyVariant(
  ms: number,
): "destructive" | "outline" | "secondary" {
  if (ms <= 0) return "destructive";
  const minutes = ms / 60_000;
  if (minutes < 5) return "destructive";
  if (minutes < 15) return "outline";
  return "secondary";
}

export function PendingSlideCard({
  payment,
  walletAddress,
  onComplete,
}: PendingSlideCardProps) {
  const { activeChain } = useChain();
  const remaining = useCountdown(payment.expiresAt);
  const isExpired = remaining <= 0;
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);

  const { status, approve, reject, amountLabel, paymentChainConfig } =
    usePaymentSigning(payment, walletAddress, activeChain, onComplete);

  const urgencyVariant = getUrgencyVariant(remaining);

  // Parse URL for display
  const displayUrl = useMemo(() => {
    try {
      const url = new URL(payment.url);
      return url.hostname;
    } catch {
      return payment.url.length > 30
        ? payment.url.slice(0, 30) + "..."
        : payment.url;
    }
  }, [payment.url]);

  const isProcessing = status === "switching" || status === "signing" || status === "submitting";
  const isSuccess = status === "success";

  if (isExpired && !isSuccess) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm font-medium">Payment expired</span>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10">
            <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="font-medium text-green-600 dark:text-green-400">Payment sent</p>
            <p className="text-sm text-muted-foreground">{amountLabel}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 p-4 pb-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{displayUrl}</p>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {paymentChainConfig.displayName}
            </Badge>
          </div>
        </div>
        <Badge variant={urgencyVariant} className="shrink-0 text-xs">
          <Clock className="mr-1 h-3 w-3" />
          {formatCountdown(remaining)}
        </Badge>
      </div>

      {/* Amount */}
      <div className="px-4 py-2">
        <p className="text-2xl font-bold">{amountLabel}</p>
      </div>

      {/* Actions */}
      <div className="space-y-2 p-4 pt-2">
        {showRejectConfirm ? (
          <div className="flex gap-2">
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => reject()}
              disabled={isProcessing}
            >
              Confirm Reject
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowRejectConfirm(false)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <>
            <SlideToAction
              onComplete={approve}
              label={isProcessing ? "Processing..." : "Slide to Approve"}
              completedLabel="Approved!"
              isLoading={isProcessing}
              disabled={isExpired}
            />
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground hover:text-destructive"
              onClick={() => setShowRejectConfirm(true)}
              disabled={isProcessing}
            >
              <X className="mr-1 h-4 w-4" />
              Reject Payment
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import { useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useChain } from "@/contexts/chain-context";
import { formatAmountForDisplay } from "@/lib/x402/display";
import { getRequirementAmount, getRequirementAmountFromLike } from "@/lib/x402/requirements";
import { usePaymentSigning, type PendingPayment as HookPendingPayment } from "@/hooks/use-payment-signing";
import { PENDING_PAYMENTS_QUERY_KEY } from "@/hooks/use-pending-payments";
import { WALLET_BALANCE_QUERY_KEY } from "@/hooks/use-wallet-balance";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Clock, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

export interface PendingPayment {
  id: string;
  url: string;
  amount?: number;
  amountRaw?: string;
  asset?: string;
  chainId?: number;
  paymentRequirements: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

interface PendingPaymentCardProps {
  payment: PendingPayment;
  walletAddress: string;
  disabled: boolean;
  onAction: () => void;
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
  ms: number
): "destructive" | "outline" | "secondary" {
  if (ms <= 0) return "destructive";
  const minutes = ms / 60_000;
  if (minutes < 5) return "destructive";
  if (minutes < 15) return "outline";
  return "secondary";
}

import { useState, useEffect } from "react";

export default function PendingPaymentCard({
  payment,
  walletAddress,
  disabled,
  onAction,
}: PendingPaymentCardProps) {
  const { activeChain } = useChain();
  const remaining = useCountdown(payment.expiresAt);
  const isExpired = remaining <= 0;
  const queryClient = useQueryClient();

  const handleComplete = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: PENDING_PAYMENTS_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: WALLET_BALANCE_QUERY_KEY });
    onAction();
  }, [queryClient, onAction]);

  const { status, approve, reject, amountLabel, paymentChainConfig } =
    usePaymentSigning(payment as HookPendingPayment, walletAddress, activeChain, handleComplete);

  const urgencyVariant = getUrgencyVariant(remaining);
  const isProcessing = status === "switching" || status === "signing" || status === "submitting";
  const isSuccess = status === "success";

  // Display amount from requirement (amountRaw + asset) or legacy payment.amount
  const parsedRequirements = useMemo(() => {
    try {
      return JSON.parse(payment.paymentRequirements);
    } catch {
      return null;
    }
  }, [payment.paymentRequirements]);

  const requirements = parsedRequirements
    ? (Array.isArray(parsedRequirements) ? parsedRequirements : parsedRequirements.accepts ?? [])
    : [];

  const amountForDisplay = payment.amount != null && payment.amount > 0
    ? { displayAmount: payment.amount.toFixed(6), symbol: "USDC" }
    : { displayAmount: "—", symbol: "" };

  const amountLabelFallback =
    amountForDisplay.displayAmount === "—"
      ? "Unknown"
      : `${amountForDisplay.displayAmount} ${amountForDisplay.symbol}`.trim();

  const finalAmountLabel = amountLabel !== "Unknown" ? amountLabel : amountLabelFallback;

  if (isSuccess) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/10">
              <Check className="h-4 w-4 text-green-500" />
            </div>
            <CardTitle className="text-sm">Payment Approved</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{finalAmountLabel}</p>
        </CardContent>
      </Card>
    );
  }

  if (isExpired) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">
            Payment Expired
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <CardTitle className="truncate text-sm font-medium">
            {payment.url}
          </CardTitle>
          <Badge variant={urgencyVariant} className="shrink-0">
            <Clock className="size-3" />
            {formatCountdown(remaining)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <div className="text-muted-foreground">Amount</div>
          <div className="font-medium">{finalAmountLabel}</div>
          <div className="text-muted-foreground">Chain</div>
          <div>{paymentChainConfig.displayName}</div>
          <div className="text-muted-foreground">Created</div>
          <div>{new Date(payment.createdAt).toLocaleString()}</div>
          <div className="text-muted-foreground">Expires</div>
          <div>{new Date(payment.expiresAt).toLocaleString()}</div>
        </div>
        <Separator />
      </CardContent>
      <CardFooter className="gap-2">
        <Button
          onClick={approve}
          disabled={disabled || isProcessing}
          size="sm"
        >
          {isProcessing ? (
            <>
              <Loader2 className="animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Check />
              Approve & Sign
            </>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={reject}
          disabled={disabled || isProcessing}
          size="sm"
        >
          <X />
          Reject
        </Button>
      </CardFooter>
    </Card>
  );
}

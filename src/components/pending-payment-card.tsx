"use client";

import { useState, useEffect, useMemo } from "react";
import { useSignTypedData, useAccount, useSwitchChain } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { authorizationTypes } from "@x402/evm";
import type { PaymentRequirements } from "@x402/core/types";
import { useChain } from "@/contexts/chain-context";
import { getChainById, getNetworkIdentifiers } from "@/lib/chain-config";
import { formatAmountForDisplay } from "@/lib/x402/display";
import { getRequirementAmount, getRequirementAmountFromLike } from "@/lib/x402/requirements";
import type { Hex } from "viem";
import { toast } from "sonner";
import {
  approvePendingPayment,
  rejectPendingPayment,
} from "@/app/actions/payments";
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

export interface PendingPayment {
  id: string;
  url: string;
  amount?: number;
  amountRaw?: string;
  asset?: string;
  chainId?: number;
  paymentRequirements: string;
  paymentRequirementsData?: unknown;
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

function generateNonce(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex}` as Hex;
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

export default function PendingPaymentCard({
  payment,
  walletAddress,
  disabled,
  onAction,
}: PendingPaymentCardProps) {
  const [actionInProgress, setActionInProgress] = useState<
    "approve" | "reject" | null
  >(null);
  const { signTypedDataAsync } = useSignTypedData();
  const { chainId: walletChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const queryClient = useQueryClient();
  const { activeChain } = useChain();
  const remaining = useCountdown(payment.expiresAt);
  const isExpired = remaining <= 0;

  const parsedRequirements = useMemo(
    () => payment.paymentRequirementsData ?? null,
    [payment.paymentRequirementsData],
  );

  // Use the payment's stored chainId if available, otherwise fall back to active chain
  const paymentChainConfig = payment.chainId !== undefined
    ? getChainById(payment.chainId) ?? activeChain
    : activeChain;

  function invalidateAndNotify() {
    queryClient.invalidateQueries({ queryKey: PENDING_PAYMENTS_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: WALLET_BALANCE_QUERY_KEY });
    onAction();
  }

  async function handleApprove() {
    setActionInProgress("approve");
    try {
      const requirements: PaymentRequirements[] = parsedRequirements
        ? (Array.isArray(parsedRequirements) ? parsedRequirements : parsedRequirements.accepts)
        : [];
      const acceptedNetworks = getNetworkIdentifiers(paymentChainConfig);
      const requirement = requirements.find(
        (r) => r.scheme === "exact" && r.network != null && acceptedNetworks.includes(r.network)
      );

      if (!requirement) {
        toast.error("No supported payment requirement found");
        return;
      }
      if (!requirement.payTo) {
        toast.error("Payment requirement missing payTo address");
        return;
      }
      const amountStr = getRequirementAmount(requirement) ?? getRequirementAmountFromLike(requirement);
      if (amountStr == null || amountStr === "") {
        toast.error("Payment requirement has no amount; cannot approve");
        return;
      }

      const amountWei = BigInt(amountStr);
      const nonce = generateNonce();
      const now = BigInt(Math.floor(Date.now() / 1_000));

      if (walletChainId !== paymentChainConfig.chain.id) {
        try {
          await switchChainAsync({ chainId: paymentChainConfig.chain.id });
        } catch {
          toast.error("Failed to switch network");
          return;
        }
      }

      const authorization = {
        from: walletAddress as Hex,
        to: requirement.payTo as Hex,
        value: amountWei,
        validAfter: BigInt(0),
        validBefore: now + BigInt(300),
        nonce,
      };

      const signature = await signTypedDataAsync({
        domain: paymentChainConfig.usdcDomain,
        types: authorizationTypes,
        primaryType: "TransferWithAuthorization",
        message: {
          from: authorization.from,
          to: authorization.to,
          value: authorization.value,
          validAfter: authorization.validAfter,
          validBefore: authorization.validBefore,
          nonce: authorization.nonce,
        },
      });

      const result = await approvePendingPayment(
        payment.id,
        signature,
        {
          from: authorization.from,
          to: authorization.to,
          value: authorization.value.toString(),
          validAfter: authorization.validAfter.toString(),
          validBefore: authorization.validBefore.toString(),
          nonce: authorization.nonce,
        },
      );

      if (result.success) {
        toast.success("Payment approved and submitted");
      } else {
        toast.error("Payment submitted but server returned an error");
      }
      invalidateAndNotify();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to sign transaction"
      );
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleReject() {
    setActionInProgress("reject");
    try {
      await rejectPendingPayment(payment.id);
      toast.success("Payment rejected");
      invalidateAndNotify();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to reject payment"
      );
    } finally {
      setActionInProgress(null);
    }
  }

  const urgencyVariant = getUrgencyVariant(remaining);
  const isActioning = actionInProgress !== null;

  // Display amount from requirement (amountRaw + asset) or legacy payment.amount
  const requirements: PaymentRequirements[] = parsedRequirements
    ? (Array.isArray(parsedRequirements) ? parsedRequirements : parsedRequirements.accepts ?? [])
    : [];
  const acceptedNetworks = getNetworkIdentifiers(paymentChainConfig);
  const displayRequirement = requirements.find(
    (r) => r.scheme === "exact" && r.network != null && acceptedNetworks.includes(r.network),
  );
  const displayAmountRaw =
    displayRequirement &&
    (payment.amountRaw ?? getRequirementAmount(displayRequirement) ?? getRequirementAmountFromLike(displayRequirement));
  const amountForDisplay =
    displayAmountRaw != null && displayAmountRaw !== ""
      ? formatAmountForDisplay(
          displayAmountRaw,
          payment.asset ?? displayRequirement?.asset,
          payment.chainId ?? paymentChainConfig.chain.id,
        )
      : payment.amount != null && payment.amount > 0
        ? { displayAmount: payment.amount.toFixed(6), symbol: "USDC" }
        : { displayAmount: "—", symbol: "" };
  const amountLabel =
    amountForDisplay.displayAmount === "—"
      ? "Unknown"
      : `${amountForDisplay.displayAmount} ${amountForDisplay.symbol}`.trim();

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
          <div className="font-medium">{amountLabel}</div>
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
          onClick={handleApprove}
          disabled={disabled || isActioning || isExpired}
          size="sm"
        >
          {actionInProgress === "approve" ? (
            <>
              <Loader2 className="animate-spin" />
              Signing...
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
          onClick={handleReject}
          disabled={disabled || isActioning || isExpired}
          size="sm"
        >
          {actionInProgress === "reject" ? (
            <>
              <Loader2 className="animate-spin" />
              Rejecting...
            </>
          ) : (
            <>
              <X />
              Reject
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}

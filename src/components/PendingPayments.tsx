"use client";

import { useCallback, useEffect, useState } from "react";
import { useSignTypedData } from "wagmi";
import {
  USDC_DOMAIN,
  TRANSFER_WITH_AUTHORIZATION_TYPES,
  buildTransferAuthorization,
} from "@/lib/x402/eip712";
import type { PaymentRequirement } from "@/lib/x402/types";
import { chainConfig } from "@/lib/chain-config";
import type { Hex } from "viem";

interface PendingPayment {
  id: string;
  url: string;
  amount: number;
  paymentRequirements: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

interface PendingPaymentsProps {
  userId: string;
  walletAddress: string;
}

export default function PendingPayments({
  userId,
  walletAddress,
}: PendingPaymentsProps) {
  const [payments, setPayments] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const { signTypedDataAsync } = useSignTypedData();

  const fetchPayments = useCallback(async () => {
    try {
      const res = await fetch(`/api/payments/pending?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setPayments(data);
      }
    } catch {
      // Network error — keep current state
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchPayments();
    const interval = setInterval(fetchPayments, 10_000);
    return () => clearInterval(interval);
  }, [fetchPayments]);

  async function handleApprove(payment: PendingPayment) {
    setActionInProgress(payment.id);
    setMessage(null);

    try {
      const requirements: PaymentRequirement[] = JSON.parse(
        payment.paymentRequirements,
      );
      const requirement = requirements.find(
        (r) => r.scheme === "exact" && r.network === chainConfig.networkString,
      );

      if (!requirement) {
        setMessage({
          type: "error",
          text: "No supported payment requirement found",
        });
        return;
      }

      const amountWei = BigInt(requirement.maxAmountRequired);

      // Build the transfer authorization
      const authorization = buildTransferAuthorization(
        walletAddress as Hex,
        requirement.payTo,
        amountWei,
      );

      // Sign with Wagmi (triggers WalletConnect)
      const signature = await signTypedDataAsync({
        domain: USDC_DOMAIN,
        types: TRANSFER_WITH_AUTHORIZATION_TYPES,
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

      // Send signature to approve endpoint
      const res = await fetch(`/api/payments/${payment.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signature,
          authorization: {
            from: authorization.from,
            to: authorization.to,
            value: authorization.value.toString(),
            validAfter: authorization.validAfter.toString(),
            validBefore: authorization.validBefore.toString(),
            nonce: authorization.nonce,
          },
        }),
      });

      if (res.ok) {
        setMessage({ type: "success", text: "Payment approved and submitted" });
        fetchPayments();
      } else {
        const err = await res.json();
        setMessage({
          type: "error",
          text: err.error || "Failed to approve payment",
        });
      }
    } catch (err) {
      setMessage({
        type: "error",
        text:
          err instanceof Error ? err.message : "Failed to sign transaction",
      });
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleReject(paymentId: string) {
    setActionInProgress(paymentId);
    setMessage(null);

    try {
      const res = await fetch(`/api/payments/${paymentId}/reject`, {
        method: "POST",
      });

      if (res.ok) {
        setMessage({ type: "success", text: "Payment rejected" });
        fetchPayments();
      } else {
        const err = await res.json();
        setMessage({
          type: "error",
          text: err.error || "Failed to reject payment",
        });
      }
    } catch {
      setMessage({ type: "error", text: "Network error" });
    } finally {
      setActionInProgress(null);
    }
  }

  function formatTimeRemaining(expiresAt: string): string {
    const remaining = new Date(expiresAt).getTime() - Date.now();
    if (remaining <= 0) return "Expired";
    const minutes = Math.floor(remaining / 60_000);
    const seconds = Math.floor((remaining % 60_000) / 1_000);
    return `${minutes}m ${seconds}s`;
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">Loading pending payments...</p>
      </div>
    );
  }

  if (payments.length === 0) {
    return null; // Don't render anything if no pending payments
  }

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 dark:border-amber-700 dark:bg-amber-950/30">
      <h2 className="mb-4 text-lg font-semibold text-black dark:text-zinc-50">
        Pending Approvals
      </h2>

      {message && (
        <p
          className={`mb-3 text-sm ${
            message.type === "success"
              ? "text-green-600 dark:text-green-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {payments.map((payment) => (
          <div
            key={payment.id}
            className="rounded border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <div className="mb-2 flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-black dark:text-zinc-50">
                  {payment.url}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  ${payment.amount.toFixed(6)} USDC &middot;{" "}
                  {new Date(payment.createdAt).toLocaleTimeString()} &middot;{" "}
                  {formatTimeRemaining(payment.expiresAt)} remaining
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleApprove(payment)}
                disabled={actionInProgress !== null}
                className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50 dark:bg-green-700 dark:hover:bg-green-600"
              >
                {actionInProgress === payment.id ? "Signing..." : "Approve & Sign"}
              </button>
              <button
                onClick={() => handleReject(payment.id)}
                disabled={actionInProgress !== null}
                className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-600"
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

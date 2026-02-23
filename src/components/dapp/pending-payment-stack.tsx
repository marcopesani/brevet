"use client";

import { useMemo } from "react";
import { ChevronRight, Bell } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { usePendingPayments } from "@/hooks/use-pending-payments";
import { PendingSlideCard } from "./pending-slide-card";
import type { PendingPayment } from "@/hooks/use-payment-signing";

interface PendingPaymentStackProps {
  initialPayments: Array<{
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
  }>;
  walletAddress: string;
  chainId: number;
}

export function PendingPaymentStack({
  initialPayments,
  walletAddress,
  chainId,
}: PendingPaymentStackProps) {
  const queryClient = useQueryClient();

  // Use polling for fresh data
  const { payments } = usePendingPayments(chainId);

  // Filter to only pending and non-expired (prefer server data initially)
  const activePayments = useMemo(() => {
    const source = payments.length > 0 ? payments : initialPayments;
    return source.filter((p) => {
      if (p.status !== "pending") return false;
      const expiresAt = new Date(p.expiresAt).getTime();
      return expiresAt > Date.now();
    });
  }, [payments, initialPayments]);

  if (activePayments.length === 0) {
    return null;
  }

  function handleComplete() {
    // Force refetch after action
    queryClient.invalidateQueries({ queryKey: ["pending-payments", chainId] });
  }

  return (
    <section className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-amber-500" />
          <h2 className="font-semibold">Pending ({activePayments.length})</h2>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Stack of cards - using staggered animation */}
      <div className="space-y-3">
        {activePayments.map((payment, index) => (
          <div
            key={payment.id}
            className="animate-card-enter"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <PendingSlideCard
              payment={payment as PendingPayment}
              walletAddress={walletAddress}
              onComplete={handleComplete}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

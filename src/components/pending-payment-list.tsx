"use client";

import { useQueryClient } from "@tanstack/react-query";
import PendingPaymentCard from "@/components/pending-payment-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Inbox } from "lucide-react";
import { useChain } from "@/contexts/chain-context";
import {
  usePendingPayments,
  PENDING_PAYMENTS_QUERY_KEY,
} from "@/hooks/use-pending-payments";

interface PendingPaymentListProps {
  walletAddress: string;
}

export default function PendingPaymentList({
  walletAddress,
}: PendingPaymentListProps) {
  const { activeChain } = useChain();
  const { payments, isLoading } = usePendingPayments(activeChain.chain.id);
  const queryClient = useQueryClient();

  function handleAction() {
    queryClient.invalidateQueries({ queryKey: PENDING_PAYMENTS_QUERY_KEY });
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-48 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (payments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16">
        <Inbox className="text-muted-foreground size-10" />
        <div className="text-center">
          <p className="font-medium">No pending payments</p>
          <p className="text-muted-foreground text-sm">
            When an MCP tool triggers a payment, it will appear here for
            approval.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {payments.map((payment) => (
        <PendingPaymentCard
          key={payment.id}
          payment={payment}
          walletAddress={walletAddress}
          disabled={false}
          onAction={handleAction}
        />
      ))}
    </div>
  );
}

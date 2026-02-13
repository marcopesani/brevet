"use client";

import { useCallback, useEffect, useState } from "react";
import PendingPaymentCard from "@/components/pending-payment-card";
import type { PendingPayment } from "@/components/pending-payment-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Inbox } from "lucide-react";

interface PendingPaymentListProps {
  userId: string;
  walletAddress: string;
}

export default function PendingPaymentList({
  userId,
  walletAddress,
}: PendingPaymentListProps) {
  const [payments, setPayments] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
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
          onAction={fetchPayments}
        />
      ))}
    </div>
  );
}

"use client";

import { useSyncExternalStore } from "react";
import { useConnection } from "wagmi";
import { ArrowUpRight } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import WithdrawPlaceholder from "@/components/withdraw-placeholder";
import WithdrawForm from "@/components/withdraw-form";

const emptySubscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

interface WithdrawCardBodyProps {
  balance?: string;
  chainId: number;
}

export default function WithdrawCardBody({
  balance,
  chainId,
}: WithdrawCardBodyProps) {
  const hasMounted = useSyncExternalStore(
    emptySubscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const { address } = useConnection();

  const showForm = hasMounted && address;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowUpRight className="h-5 w-5" />
          Withdraw
        </CardTitle>
        <CardDescription>
          {showForm ? (
            <div className="flex items-center gap-2">
              <span>To:</span>
              <span className="font-mono">{`${address!.slice(0, 6)}...${address!.slice(-4)}`}</span>
            </div>
          ) : (
            "Connect your wallet to withdraw."
          )}
        </CardDescription>
      </CardHeader>
      {!showForm ? (
        <WithdrawPlaceholder />
      ) : (
        <WithdrawForm balance={balance} chainId={chainId} address={address!} />
      )}
    </Card>
  );
}

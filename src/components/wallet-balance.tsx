"use client";

import { useState } from "react";
import { Wallet, Copy, Check, ExternalLink } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface WalletBalanceProps {
  hotWalletAddress: string | null;
  userId: string;
  balance: string | null;
  balanceLoading: boolean;
  balanceError: Error | null;
  chainName: string;
  explorerUrl: string;
}

export default function WalletBalance({
  hotWalletAddress,
  balance,
  balanceLoading,
  balanceError,
  chainName,
  explorerUrl,
}: WalletBalanceProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!hotWalletAddress) return;
    await navigator.clipboard.writeText(hotWalletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!hotWalletAddress) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Hot Wallet — {chainName}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {balanceLoading
              ? "Loading wallet..."
              : "No hot wallet found. Please reconnect your wallet."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const truncatedAddress = `${hotWalletAddress.slice(0, 6)}...${hotWalletAddress.slice(-4)}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Hot Wallet — {chainName}
        </CardTitle>
        <CardDescription className="flex items-center gap-2">
          <a
            href={`${explorerUrl}/address/${hotWalletAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-mono text-xs hover:underline"
          >
            {truncatedAddress}
            <ExternalLink className="h-3 w-3" />
          </a>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-3 w-3 text-green-600" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">USDC Balance</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight">
              {balanceError
                ? "Unavailable"
                : balanceLoading && balance === null
                  ? "Loading..."
                  : balance !== null
                    ? `$${balance}`
                    : "Loading..."}
            </span>
            <Badge variant="secondary">USDC</Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

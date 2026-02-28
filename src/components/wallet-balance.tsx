"use client";

import { useState, type ReactNode } from "react";
import { Wallet, Copy, Check, ExternalLink, Shield } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { SmartAccountDTO } from "@/lib/models/smart-account";

interface WalletBalanceProps {
  accountAddress: string;
  balanceSlot: ReactNode;
  chainName: string;
  explorerUrl: string;
  sessionKeyStatus?: SmartAccountDTO["sessionKeyStatus"];
}

export default function WalletBalance({
  accountAddress,
  balanceSlot,
  chainName,
  explorerUrl,
  sessionKeyStatus,
}: WalletBalanceProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(accountAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const truncatedAddress = `${accountAddress.slice(0, 6)}...${accountAddress.slice(-4)}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Smart Account — {chainName}
        </CardTitle>
        <CardDescription className="flex items-center gap-2">
          <a
            href={`${explorerUrl}/address/${accountAddress}`}
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
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">USDC Balance</p>
          <div className="flex items-baseline gap-2">
            {balanceSlot}
            <Badge variant="secondary">USDC</Badge>
          </div>
        </div>
        {sessionKeyStatus && (
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Session Key:</span>
            <Badge
              variant={sessionKeyStatus === "active" ? "default" : "outline"}
              className={
                sessionKeyStatus === "active"
                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                  : ""
              }
            >
              {sessionKeyStatus === "active"
                ? "Active"
                : sessionKeyStatus === "pending_grant"
                  ? "Pending Authorization"
                  : sessionKeyStatus === "expired"
                    ? "Expired"
                    : "Revoked"}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

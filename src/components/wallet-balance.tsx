"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { Wallet, Copy, Check } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useWalletBalance } from "@/hooks/use-wallet-balance";
import { ensureHotWallet } from "@/app/actions/wallet";

interface WalletBalanceProps {
  onWalletReady?: (data: {
    hotWalletAddress: string;
    userId: string;
    balance: string | null;
  }) => void;
}

export default function WalletBalance({ onWalletReady }: WalletBalanceProps) {
  const { isConnected } = useAccount();
  const [hotWalletAddress, setHotWalletAddress] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { balance, error: balanceError, isLoading: balanceLoading } =
    useWalletBalance(!!hotWalletAddress);

  useEffect(() => {
    if (!isConnected) {
      setHotWalletAddress(null);
      setUserId(null);
      return;
    }

    let cancelled = false;

    async function initWallet() {
      setWalletLoading(true);
      setWalletError(null);
      try {
        const data = await ensureHotWallet();
        if (!cancelled) {
          setHotWalletAddress(data.address);
          setUserId(data.userId);
        }
      } catch (err) {
        if (!cancelled) {
          setWalletError(
            err instanceof Error ? err.message : "Unknown error"
          );
        }
      } finally {
        if (!cancelled) {
          setWalletLoading(false);
        }
      }
    }

    initWallet();

    return () => {
      cancelled = true;
    };
  }, [isConnected]);

  // Notify parent when wallet is ready
  useEffect(() => {
    if (hotWalletAddress && userId) {
      onWalletReady?.({
        hotWalletAddress,
        userId,
        balance,
      });
    }
  }, [hotWalletAddress, userId, balance, onWalletReady]);

  async function handleCopy() {
    if (!hotWalletAddress) return;
    await navigator.clipboard.writeText(hotWalletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!isConnected) return null;

  if (walletLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Hot Wallet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardContent>
      </Card>
    );
  }

  if (walletError) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Hot Wallet
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{walletError}</p>
        </CardContent>
      </Card>
    );
  }

  if (!hotWalletAddress) return null;

  const truncatedAddress = `${hotWalletAddress.slice(0, 6)}...${hotWalletAddress.slice(-4)}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Hot Wallet
        </CardTitle>
        <CardDescription className="flex items-center gap-2">
          <span className="font-mono text-xs">{truncatedAddress}</span>
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
                : balanceLoading
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

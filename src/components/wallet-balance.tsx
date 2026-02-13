"use client";

import { useEffect, useState, useCallback } from "react";
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

interface WalletBalanceProps {
  onWalletReady?: (data: {
    hotWalletAddress: string;
    userId: string;
    balance: string | null;
    fetchBalance: () => void;
  }) => void;
}

export default function WalletBalance({ onWalletReady }: WalletBalanceProps) {
  const { address, isConnected } = useAccount();
  const [hotWalletAddress, setHotWalletAddress] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceUnavailable, setBalanceUnavailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchBalance = useCallback(async (addr: string) => {
    try {
      const res = await fetch(`/api/wallet/balance?address=${addr}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setBalance(data.balance);
        setBalanceUnavailable(false);
      } else if (res.status === 503) {
        setBalanceUnavailable(true);
      }
    } catch {
      // Balance fetch is non-critical; silently retry on next interval
    }
  }, []);

  useEffect(() => {
    if (!isConnected || !address) {
      setHotWalletAddress(null);
      setBalance(null);
      return;
    }

    let cancelled = false;

    async function createWallet() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/wallet/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress: address }),
        });

        if (!res.ok) {
          throw new Error("Failed to create hot wallet");
        }

        const data = await res.json();
        if (!cancelled) {
          setHotWalletAddress(data.address);
          setUserId(data.userId);
          fetchBalance(data.address);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    createWallet();

    return () => {
      cancelled = true;
    };
  }, [isConnected, address, fetchBalance]);

  // Refresh balance every 15 seconds
  useEffect(() => {
    if (!hotWalletAddress) return;
    const interval = setInterval(() => fetchBalance(hotWalletAddress), 15_000);
    return () => clearInterval(interval);
  }, [hotWalletAddress, fetchBalance]);

  // Notify parent when wallet is ready
  useEffect(() => {
    if (hotWalletAddress && userId) {
      onWalletReady?.({
        hotWalletAddress,
        userId,
        balance,
        fetchBalance: () => fetchBalance(hotWalletAddress),
      });
    }
  }, [hotWalletAddress, userId, balance, onWalletReady, fetchBalance]);

  async function handleCopy() {
    if (!hotWalletAddress) return;
    await navigator.clipboard.writeText(hotWalletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!isConnected) return null;

  if (loading) {
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

  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Hot Wallet
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{error}</p>
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
              {balanceUnavailable
                ? "Unavailable"
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

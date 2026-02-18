"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getDefaultChainConfig } from "@/lib/chain-config";
import { withdrawFromWallet } from "@/app/actions/wallet";
import { WALLET_BALANCE_QUERY_KEY } from "@/hooks/use-wallet-balance";

interface WithdrawWalletFormProps {
  balance: string | null;
}

export default function WithdrawWalletForm({
  balance,
}: WithdrawWalletFormProps) {
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  function handleMax() {
    if (balance) {
      setAmount(balance);
    }
  }

  async function handleWithdraw() {
    if (!amount || parseFloat(amount) <= 0 || !address) return;

    setLoading(true);
    setError(null);
    setTxHash(null);

    try {
      const data = await withdrawFromWallet(parseFloat(amount), address);

      setTxHash(data.txHash);
      setAmount("");
      queryClient.invalidateQueries({ queryKey: WALLET_BALANCE_QUERY_KEY });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Withdrawal failed");
    } finally {
      setLoading(false);
    }
  }

  if (!address) return null;

  const truncatedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowUpRight className="h-5 w-5" />
          Withdraw
        </CardTitle>
        <CardDescription>
          To: <span className="font-mono">{truncatedAddress}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="withdraw-amount">Amount (USDC)</Label>
          <div className="flex gap-2">
            <Input
              id="withdraw-amount"
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="0"
              step="0.01"
              disabled={loading}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleMax}
              disabled={!balance || balance === "0"}
              className="shrink-0"
            >
              Max
            </Button>
          </div>
        </div>
        {error && (
          <p className="text-sm text-destructive">
            {error.length > 100 ? error.slice(0, 100) + "..." : error}
          </p>
        )}
        {txHash && (
          <div className="rounded-md border border-green-200 bg-green-50 p-3 dark:border-green-900 dark:bg-green-950">
            <p className="text-sm font-medium text-green-800 dark:text-green-200">
              Withdrawn successfully!
            </p>
            <a
              href={`${getDefaultChainConfig().explorerUrl}/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-green-700 underline dark:text-green-300"
            >
              View on BaseScan
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button
          onClick={handleWithdraw}
          disabled={loading || !amount || parseFloat(amount) <= 0}
          className="w-full"
        >
          {loading ? "Withdrawing..." : "Withdraw"}
        </Button>
      </CardFooter>
    </Card>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useSwitchChain } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { parseUnits } from "viem";
import { toast } from "sonner";
import { ArrowDownLeft, ExternalLink } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getChainConfig, getDefaultChainConfig } from "@/lib/chain-config";
import { WALLET_BALANCE_QUERY_KEY } from "@/hooks/use-wallet-balance";

const USDC_DECIMALS = 6;

const ERC20_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

interface FundWalletFormProps {
  accountAddress: string | null;
  chainId?: number;
}

export default function FundWalletForm({
  accountAddress,
  chainId,
}: FundWalletFormProps) {
  const [amount, setAmount] = useState("");
  const queryClient = useQueryClient();

  const { chainId: walletChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const chainConfig = chainId ? getChainConfig(chainId) ?? getDefaultChainConfig() : getDefaultChainConfig();

  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  async function handleFund() {
    if (!accountAddress || !amount || parseFloat(amount) <= 0) return;

    if (walletChainId !== chainConfig.chain.id) {
      try {
        await switchChainAsync({ chainId: chainConfig.chain.id });
      } catch {
        toast.error("Failed to switch network");
        return;
      }
    }

    writeContract({
      address: chainConfig.usdcAddress,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [
        accountAddress as `0x${string}`,
        parseUnits(amount, USDC_DECIMALS),
      ],
    });
  }

  useEffect(() => {
    if (isSuccess) {
      queryClient.invalidateQueries({ queryKey: WALLET_BALANCE_QUERY_KEY });
    }
  }, [isSuccess, queryClient]);

  const explorerName = chainConfig.explorerUrl.replace("https://", "").split("/")[0];

  const statusText = isPending
    ? "Confirming in wallet..."
    : isConfirming
      ? "Transaction pending..."
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowDownLeft className="h-5 w-5" />
          Fund Account
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fund-amount">Amount (USDC)</Label>
          <Input
            id="fund-amount"
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="0"
            step="0.01"
            disabled={!accountAddress || isPending || isConfirming}
          />
        </div>
        {error && (
          <p className="text-sm text-destructive">
            {error.message.length > 100
              ? error.message.slice(0, 100) + "..."
              : error.message}
          </p>
        )}
        {statusText && (
          <p className="text-sm text-muted-foreground">{statusText}</p>
        )}
        {isSuccess && txHash && (
          <div className="rounded-md border border-green-200 bg-green-50 p-3 dark:border-green-900 dark:bg-green-950">
            <p className="text-sm font-medium text-green-800 dark:text-green-200">
              Funded successfully!
            </p>
            <a
              href={`${chainConfig.explorerUrl}/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-green-700 underline dark:text-green-300"
            >
              View on {explorerName}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </CardContent>
      <CardFooter>
        {isSuccess ? (
          <Button
            variant="outline"
            onClick={() => {
              reset();
              setAmount("");
            }}
            className="w-full"
          >
            Fund Again
          </Button>
        ) : (
          <Button
            onClick={handleFund}
            disabled={!accountAddress || isPending || isConfirming || !amount || parseFloat(amount) <= 0}
            className="w-full"
          >
            {isPending
              ? "Confirming in wallet..."
              : isConfirming
                ? "Transaction pending..."
                : "Fund Account"}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

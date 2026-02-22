"use client";

import { useState, useEffect } from "react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  useSwitchChain,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { parseUnits } from "viem";
import { toast } from "sonner";
import {
  Copy,
  Check,
  ExternalLink,
  ArrowDownLeft,
  AlertTriangle,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getDefaultChainConfig } from "@/lib/chain-config";
import { useWalletBalance, WALLET_BALANCE_QUERY_KEY } from "@/hooks/use-wallet-balance";

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

interface FundAccountStepProps {
  onComplete: () => void;
  onSkip: () => void;
  smartAccountAddress: string;
}

export default function FundAccountStep({
  onComplete,
  onSkip,
  smartAccountAddress,
}: FundAccountStepProps) {
  const [amount, setAmount] = useState("");
  const [copied, setCopied] = useState(false);

  const queryClient = useQueryClient();
  const chainConfig = getDefaultChainConfig();
  const { chainId: walletChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const { balance, isLoading: balanceLoading } = useWalletBalance(true, undefined, chainConfig.chain.id);

  const {
    writeContract,
    data: txHash,
    isPending,
    error: txError,
    reset,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Invalidate balance after successful funding
  useEffect(() => {
    if (isSuccess) {
      queryClient.invalidateQueries({ queryKey: WALLET_BALANCE_QUERY_KEY });
    }
  }, [isSuccess, queryClient]);

  const hasFunds = balance !== undefined && balance !== null && parseFloat(balance) > 0;

  async function handleFund() {
    if (!amount || parseFloat(amount) <= 0) return;

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
        smartAccountAddress as `0x${string}`,
        parseUnits(amount, USDC_DECIMALS),
      ],
    });
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(smartAccountAddress);
    setCopied(true);
    toast.success("Address copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  const truncatedAddress = `${smartAccountAddress.slice(0, 6)}...${smartAccountAddress.slice(-4)}`;
  const explorerName = chainConfig.explorerUrl
    .replace("https://", "")
    .split("/")[0];

  return (
    <div className="space-y-6">
      {/* Balance display */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <Wallet className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Smart Account Balance
          </span>
        </div>
        <div className="flex items-baseline justify-center gap-2">
          <span className="text-3xl font-bold tracking-tight">
            {balanceLoading
              ? "Loading..."
              : balance !== undefined && balance !== null
                ? `$${balance}`
                : "$0.00"}
          </span>
          <Badge variant="secondary">USDC</Badge>
        </div>
        <p className="text-xs text-muted-foreground font-mono">
          <a
            href={`${chainConfig.explorerUrl}/address/${smartAccountAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:underline"
          >
            {truncatedAddress}
            <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </div>

      {/* If already funded, show continue */}
      {hasFunds && !isSuccess && (
        <Alert>
          <Check className="h-4 w-4" />
          <AlertDescription>
            Your smart account already has USDC. You can continue or add more
            funds.
          </AlertDescription>
        </Alert>
      )}

      {/* Path A: Transfer from connected wallet */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ArrowDownLeft className="h-4 w-4" />
            Transfer from Connected Wallet
          </CardTitle>
          <CardDescription>
            Send USDC from your connected wallet to your smart account
          </CardDescription>
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
              disabled={isPending || isConfirming}
            />
          </div>
          {txError && (
            <p className="text-sm text-destructive">
              {txError.message.length > 100
                ? txError.message.slice(0, 100) + "..."
                : txError.message}
            </p>
          )}
          {(isPending || isConfirming) && (
            <p className="text-sm text-muted-foreground">
              {isPending ? "Confirming in wallet..." : "Transaction pending..."}
            </p>
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
              disabled={
                isPending ||
                isConfirming ||
                !amount ||
                parseFloat(amount) <= 0
              }
              className="w-full"
            >
              {isPending
                ? "Confirming in wallet..."
                : isConfirming
                  ? "Transaction pending..."
                  : "Transfer USDC"}
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-4">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">or</span>
        <Separator className="flex-1" />
      </div>

      {/* Path B: Copy address for external funding */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Copy className="h-4 w-4" />
            Fund from External Source
          </CardTitle>
          <CardDescription>
            Copy your smart account address and send USDC from any wallet or
            exchange
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm font-mono">
              {truncatedAddress}
            </code>
            <Button
              variant="outline"
              size="icon"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Send USDC on {chainConfig.chain.name} to this address. Balance
            updates automatically.
          </p>
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex flex-col gap-3">
        <Button
          onClick={onComplete}
          disabled={!hasFunds && !isSuccess}
          className="w-full"
          size="lg"
        >
          Continue
        </Button>
        <Button
          variant="ghost"
          onClick={onSkip}
          className="w-full text-muted-foreground"
        >
          Skip for now
        </Button>
        {!hasFunds && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              You&apos;ll need USDC before your first payment
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}

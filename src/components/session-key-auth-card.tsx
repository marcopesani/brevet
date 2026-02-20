"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, Key, Clock, DollarSign } from "lucide-react";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { authorizeSessionKey } from "@/app/actions/smart-account";

interface SessionKeyAuthCardProps {
  smartAccountAddress: string | null;
  sessionKeyAddress?: string;
  chainId: number;
}

const EXPIRY_OPTIONS = [
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
  { value: "60", label: "60 days" },
  { value: "90", label: "90 days" },
];

export default function SessionKeyAuthCard({
  smartAccountAddress,
  sessionKeyAddress,
  chainId,
}: SessionKeyAuthCardProps) {
  const [spendLimitPerTx, setSpendLimitPerTx] = useState("50");
  const [spendLimitDaily, setSpendLimitDaily] = useState("500");
  const [expiryDays, setExpiryDays] = useState("30");
  const queryClient = useQueryClient();

  const { mutate: doAuthorize, isPending } = useMutation({
    mutationFn: () =>
      authorizeSessionKey(
        chainId,
        parseFloat(spendLimitPerTx) || 50,
        parseFloat(spendLimitDaily) || 500,
        parseInt(expiryDays, 10) || 30,
      ),
    onSuccess: (result) => {
      toast.success("Session key authorized successfully!");
      queryClient.invalidateQueries({ queryKey: ["smart-account", chainId] });
      queryClient.invalidateQueries({ queryKey: ["smart-accounts-all"] });
      if (result.grantTxHash) {
        toast.info(`Grant tx: ${result.grantTxHash.slice(0, 10)}...`);
      }
    },
    onError: (error: Error) => {
      toast.error(
        error.message.length > 120
          ? error.message.slice(0, 120) + "..."
          : error.message,
      );
    },
  });

  return (
    <Card className="border-amber-200 dark:border-amber-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5 text-amber-500" />
          Authorize Session Key
        </CardTitle>
        <CardDescription>
          Configure spend limits and authorize the session key so AI agents can
          make payments on your behalf.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Smart Account Address (read-only) */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            Smart Account
          </Label>
          <code className="block text-xs font-mono bg-muted/50 rounded px-2 py-1.5">
            {smartAccountAddress ?? "—"}
          </code>
        </div>

        {/* Session Key Address (read-only) */}
        {sessionKeyAddress && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Session Key
            </Label>
            <code className="block text-xs font-mono bg-muted/50 rounded px-2 py-1.5">
              {sessionKeyAddress}
            </code>
          </div>
        )}

        {/* Spend Limit Per Transaction */}
        <div className="space-y-2">
          <Label htmlFor="spend-limit-per-tx" className="flex items-center gap-1">
            <DollarSign className="h-3.5 w-3.5" />
            Spend Limit Per Transaction (USDC)
          </Label>
          <Input
            id="spend-limit-per-tx"
            type="number"
            placeholder="50"
            value={spendLimitPerTx}
            onChange={(e) => setSpendLimitPerTx(e.target.value)}
            min="0"
            step="1"
            disabled={isPending}
          />
        </div>

        {/* Daily Spend Limit */}
        <div className="space-y-2">
          <Label htmlFor="spend-limit-daily" className="flex items-center gap-1">
            <DollarSign className="h-3.5 w-3.5" />
            Daily Spend Limit (USDC)
          </Label>
          <Input
            id="spend-limit-daily"
            type="number"
            placeholder="500"
            value={spendLimitDaily}
            onChange={(e) => setSpendLimitDaily(e.target.value)}
            min="0"
            step="1"
            disabled={isPending}
          />
        </div>

        {/* Expiry Period */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            Expiry Period
          </Label>
          <Select value={expiryDays} onValueChange={setExpiryDays} disabled={isPending}>
            <SelectTrigger>
              <SelectValue placeholder="Select expiry" />
            </SelectTrigger>
            <SelectContent>
              {EXPIRY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Info Banner */}
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
          <p className="text-xs text-amber-800 dark:text-amber-200">
            <Shield className="mr-1 inline h-3 w-3" />
            This will submit a transaction to install the session key permission
            module on your smart account. Gas is sponsored on testnets.
          </p>
        </div>
      </CardContent>
      <CardFooter>
        <Button
          onClick={() => doAuthorize()}
          disabled={isPending}
          className="w-full"
        >
          {isPending ? "Authorizing..." : "Authorize Session Key"}
        </Button>
      </CardFooter>
    </Card>
  );
}

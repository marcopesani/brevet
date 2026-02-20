"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, Key, Clock, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { useWalletClient } from "wagmi";
import { createPublicClient, http, custom, zeroAddress, type Hex, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createKernelAccount, createKernelAccountClient } from "@zerodev/sdk";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { toPermissionValidator, serializePermissionAccount } from "@zerodev/permissions";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { ENTRY_POINT, KERNEL_VERSION, buildSessionKeyPolicies } from "@/lib/smart-account-policies";
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
import {
  prepareSessionKeyAuth,
  sendBundlerRequest,
  finalizeSessionKey,
} from "@/app/actions/smart-account";
import { getChainConfig } from "@/lib/chain-config";

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

type AuthStatus =
  | null
  | "preparing"
  | "building"
  | "signing"
  | "confirming"
  | "finalizing";

const STATUS_LABELS: Record<NonNullable<AuthStatus>, string> = {
  preparing: "Preparing...",
  building: "Building transaction...",
  signing: "Approve in wallet...",
  confirming: "Waiting for confirmation...",
  finalizing: "Finalizing...",
};

function createBundlerTransport(chainId: number) {
  return custom({
    async request({ method, params }: { method: string; params?: unknown }) {
      return sendBundlerRequest(chainId, method, (params ?? []) as unknown[]);
    },
  });
}

export default function SessionKeyAuthCard({
  smartAccountAddress,
  sessionKeyAddress,
  chainId,
}: SessionKeyAuthCardProps) {
  const [spendLimitPerTx, setSpendLimitPerTx] = useState("50");
  const [spendLimitDaily, setSpendLimitDaily] = useState("500");
  const [expiryDays, setExpiryDays] = useState("30");
  const [status, setStatus] = useState<AuthStatus>(null);
  const queryClient = useQueryClient();
  const { data: walletClient } = useWalletClient();

  const { mutate: doAuthorize, isPending } = useMutation({
    mutationFn: async () => {
      setStatus("preparing");

      // 1. Get session key from server
      const { sessionKeyHex, smartAccountAddress: saAddress } =
        await prepareSessionKeyAuth(chainId);

      // 2. Verify wallet is connected
      if (!walletClient) throw new Error("Wallet not connected");

      setStatus("building");

      // 3. Build validators
      const config = getChainConfig(chainId);
      if (!config) throw new Error(`Unsupported chain: ${chainId}`);

      const publicClient = createPublicClient({
        chain: config.chain,
        transport: http(),
      });

      const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
        signer: walletClient,
        entryPoint: ENTRY_POINT,
        kernelVersion: KERNEL_VERSION,
      });

      const sessionKeyAccount = privateKeyToAccount(sessionKeyHex as Hex);
      const ecdsaSigner = await toECDSASigner({ signer: sessionKeyAccount });

      const expiryTimestamp = Math.floor(
        Date.now() / 1000 + parseInt(expiryDays, 10) * 24 * 60 * 60,
      );

      const permissionValidator = await toPermissionValidator(publicClient, {
        signer: ecdsaSigner,
        policies: buildSessionKeyPolicies(config.usdcAddress as Address, expiryTimestamp),
        entryPoint: ENTRY_POINT,
        kernelVersion: KERNEL_VERSION,
      });

      // 4. Build Kernel account
      const kernelAccount = await createKernelAccount(publicClient, {
        entryPoint: ENTRY_POINT,
        kernelVersion: KERNEL_VERSION,
        plugins: {
          sudo: ecdsaValidator,
          regular: permissionValidator,
        },
        address: saAddress as Address,
      });

      // 5. Build kernel client with proxied bundler transport
      const bundlerTransport = createBundlerTransport(chainId);

      const pimlicoClient = createPimlicoClient({
        chain: config.chain,
        transport: bundlerTransport,
        entryPoint: ENTRY_POINT,
      });

      const kernelClient = createKernelAccountClient({
        account: kernelAccount,
        chain: config.chain,
        bundlerTransport,
        client: publicClient,
        paymaster: {
          getPaymasterData: pimlicoClient.getPaymasterData,
          getPaymasterStubData: pimlicoClient.getPaymasterStubData,
        },
        userOperation: {
          estimateFeesPerGas: async () => {
            const gasPrice = await pimlicoClient.getUserOperationGasPrice();
            return gasPrice.fast;
          },
        },
      });

      // 6. Send UserOp — triggers WalletConnect popup for owner signature
      setStatus("signing");
      const userOpHash = await kernelClient.sendUserOperation({
        callData: await kernelAccount.encodeCalls([
          { to: zeroAddress, value: BigInt(0), data: "0x" },
        ]),
      });

      // 7. Wait for on-chain confirmation
      setStatus("confirming");
      const receipt = await pimlicoClient.waitForUserOperationReceipt({
        hash: userOpHash,
        timeout: 120_000,
      });

      if (!receipt.success) throw new Error("UserOperation failed on-chain");

      // 8. Serialize the permission account (client-side)
      setStatus("finalizing");
      const serialized = await serializePermissionAccount(
        kernelAccount,
        sessionKeyHex as Hex,
      );

      // 9. Finalize on server — verify tx, store serialized account, activate
      const grantTxHash = receipt.receipt.transactionHash;
      const result = await finalizeSessionKey(
        chainId,
        grantTxHash,
        serialized,
        Math.round((parseFloat(spendLimitPerTx) || 50) * 1e6),
        Math.round((parseFloat(spendLimitDaily) || 500) * 1e6),
        parseInt(expiryDays, 10) || 30,
      );

      return result;
    },
    onSuccess: (result) => {
      setStatus(null);
      toast.success("Session key authorized successfully!");
      queryClient.invalidateQueries({ queryKey: ["smart-account", chainId] });
      queryClient.invalidateQueries({ queryKey: ["smart-accounts-all"] });
      if (result.grantTxHash) {
        toast.info(`Grant tx: ${result.grantTxHash.slice(0, 10)}...`);
      }
    },
    onError: (error: Error) => {
      setStatus(null);
      toast.error(
        error.message.length > 120
          ? error.message.slice(0, 120) + "..."
          : error.message,
      );
    },
  });

  const buttonText =
    status !== null ? STATUS_LABELS[status] : "Authorize Session Key";

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
            module on your smart account. You will be asked to approve the
            transaction in your wallet. Gas is sponsored on testnets.
          </p>
        </div>
      </CardContent>
      <CardFooter>
        <Button
          onClick={() => doAuthorize()}
          disabled={isPending || !walletClient}
          className="w-full"
        >
          {buttonText}
        </Button>
      </CardFooter>
    </Card>
  );
}

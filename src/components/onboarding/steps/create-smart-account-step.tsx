"use client";

import { useState, useEffect, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield,
  Key,
  Clock,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { useWalletClient } from "wagmi";
import {
  createPublicClient,
  http,
  custom,
  zeroAddress,
  type Hex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createKernelAccount, createKernelAccountClient } from "@zerodev/sdk";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import {
  toPermissionValidator,
  serializePermissionAccount,
} from "@zerodev/permissions";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import {
  ENTRY_POINT,
  KERNEL_VERSION,
  buildSessionKeyPolicies,
} from "@/lib/smart-account-policies";
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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  setupSmartAccount,
  prepareSessionKeyAuth,
  sendBundlerRequest,
  finalizeSessionKey,
} from "@/app/actions/smart-account";
import { getChainConfig } from "@/lib/chain-config";

interface CreateSmartAccountStepProps {
  onComplete: () => void;
  walletAddress: string;
  smartAccountAddress: string | null;
}

type SubStep = "creating" | "configuring" | "authorizing" | "done";

type AuthStatus =
  | null
  | "preparing"
  | "building"
  | "signing"
  | "confirming"
  | "finalizing";

const AUTH_STATUS_LABELS: Record<NonNullable<AuthStatus>, string> = {
  preparing: "Preparing session key...",
  building: "Building transaction...",
  signing: "Approve in your wallet...",
  confirming: "Waiting for on-chain confirmation...",
  finalizing: "Finalizing setup...",
};

const EXPIRY_OPTIONS = [
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
  { value: "60", label: "60 days" },
  { value: "90", label: "90 days" },
];

const DEFAULT_CHAIN_ID = parseInt(
  process.env.NEXT_PUBLIC_CHAIN_ID || "8453",
  10,
);

function createBundlerTransport(chainId: number) {
  return custom({
    async request({ method, params }: { method: string; params?: unknown }) {
      return sendBundlerRequest(chainId, method, (params ?? []) as unknown[]);
    },
  });
}

export default function CreateSmartAccountStep({
  onComplete,
  walletAddress,
  smartAccountAddress: initialSmartAccountAddress,
}: CreateSmartAccountStepProps) {
  const [subStep, setSubStep] = useState<SubStep>(
    initialSmartAccountAddress ? "done" : "creating",
  );
  const [smartAccountAddr, setSmartAccountAddr] = useState<string | null>(
    initialSmartAccountAddress,
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [spendLimitPerTx, setSpendLimitPerTx] = useState("50");
  const [spendLimitDaily, setSpendLimitDaily] = useState("500");
  const [expiryDays, setExpiryDays] = useState("30");
  const [authStatus, setAuthStatus] = useState<AuthStatus>(null);

  const queryClient = useQueryClient();
  const { data: walletClient } = useWalletClient();
  const chainId = DEFAULT_CHAIN_ID;

  // Auto-advance if account already exists (returning user)
  useEffect(() => {
    if (initialSmartAccountAddress && subStep === "done") {
      const timer = setTimeout(onComplete, 1500);
      return () => clearTimeout(timer);
    }
  }, [initialSmartAccountAddress, subStep, onComplete]);

  // Step 1: Create smart account
  const createMutation = useMutation({
    mutationFn: async () => {
      const result = await setupSmartAccount(chainId);
      return result;
    },
    onSuccess: (result) => {
      setSmartAccountAddr(result.smartAccountAddress);
      if (result.sessionKeyStatus === "active") {
        // Session key already active — skip to done
        setSubStep("done");
        toast.success("Smart account already set up!");
        setTimeout(onComplete, 1000);
      } else {
        setSubStep("configuring");
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

  // Step 3: Authorize session key
  const authorizeMutation = useMutation({
    mutationFn: async () => {
      setAuthStatus("preparing");

      const { sessionKeyHex, smartAccountAddress: saAddress } =
        await prepareSessionKeyAuth(chainId);

      if (!walletClient) throw new Error("Wallet not connected");

      setAuthStatus("building");

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
        policies: buildSessionKeyPolicies(
          config.usdcAddress as Address,
          expiryTimestamp,
        ),
        entryPoint: ENTRY_POINT,
        kernelVersion: KERNEL_VERSION,
      });

      const kernelAccount = await createKernelAccount(publicClient, {
        entryPoint: ENTRY_POINT,
        kernelVersion: KERNEL_VERSION,
        plugins: {
          sudo: ecdsaValidator,
          regular: permissionValidator,
        },
        address: saAddress as Address,
      });

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

      setAuthStatus("signing");
      const userOpHash = await kernelClient.sendUserOperation({
        callData: await kernelAccount.encodeCalls([
          { to: zeroAddress, value: BigInt(0), data: "0x" },
        ]),
      });

      setAuthStatus("confirming");
      const receipt = await pimlicoClient.waitForUserOperationReceipt({
        hash: userOpHash,
        timeout: 120_000,
      });

      if (!receipt.success) throw new Error("UserOperation failed on-chain");

      setAuthStatus("finalizing");
      const serialized = await serializePermissionAccount(
        kernelAccount,
        sessionKeyHex as Hex,
      );

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
    onSuccess: () => {
      setAuthStatus(null);
      setSubStep("done");
      queryClient.invalidateQueries({ queryKey: ["smart-account", chainId] });
      queryClient.invalidateQueries({ queryKey: ["smart-accounts-all"] });
      toast.success("Smart account is ready!");
      setTimeout(onComplete, 1000);
    },
    onError: (error: Error) => {
      setAuthStatus(null);
      setSubStep("configuring");
      toast.error(
        error.message.length > 120
          ? error.message.slice(0, 120) + "..."
          : error.message,
      );
    },
  });

  const handleAuthorize = useCallback(() => {
    authorizeMutation.mutate();
  }, [authorizeMutation]);

  const isProcessing = createMutation.isPending || authorizeMutation.isPending;

  // Returning user: account already exists and session key active
  if (initialSmartAccountAddress && subStep === "done") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <CheckCircle2 className="h-12 w-12 text-green-500" />
          <div className="text-center">
            <p className="font-medium">Smart Account Ready</p>
            <code className="mt-1 block text-xs font-mono text-muted-foreground">
              {initialSmartAccountAddress}
            </code>
          </div>
          <Badge variant="secondary">Already configured</Badge>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sub-progress indicator */}
      <div className="flex items-center gap-2 text-sm">
        <SubStepDot active={subStep === "creating"} completed={subStep !== "creating"} />
        <span className={subStep === "creating" ? "font-medium" : "text-muted-foreground"}>
          Creating
        </span>
        <div className="h-px flex-1 bg-border" />
        <SubStepDot
          active={subStep === "configuring"}
          completed={subStep === "authorizing" || subStep === "done"}
        />
        <span className={subStep === "configuring" ? "font-medium" : "text-muted-foreground"}>
          Configuring
        </span>
        <div className="h-px flex-1 bg-border" />
        <SubStepDot
          active={subStep === "authorizing"}
          completed={subStep === "done"}
        />
        <span className={subStep === "authorizing" ? "font-medium" : "text-muted-foreground"}>
          Authorizing
        </span>
      </div>

      {/* Sub-step 1: Create Smart Account */}
      {subStep === "creating" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-5 w-5" />
              Create Smart Account
            </CardTitle>
            <CardDescription>
              A smart account lets AI agents make payments on your behalf while
              you stay in control. Your wallet ({walletAddress.slice(0, 6)}...
              {walletAddress.slice(-4)}) will be the owner.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950">
              <p className="text-xs text-blue-800 dark:text-blue-200">
                <Shield className="mr-1 inline h-3 w-3" />
                This creates a counterfactual smart account address. No
                on-chain transaction is needed yet — the account is deployed
                when the first payment is made.
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="w-full"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Smart Account...
                </>
              ) : (
                "Create Smart Account"
              )}
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Sub-step 2: Configure session key limits */}
      {subStep === "configuring" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Key className="h-5 w-5" />
              Authorize Session Key
            </CardTitle>
            <CardDescription>
              A session key allows AI agents to sign transactions within your
              spending limits — without needing your wallet approval every time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Smart account address (read-only) */}
            {smartAccountAddr && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Smart Account
                </Label>
                <code className="block text-xs font-mono bg-muted/50 rounded px-2 py-1.5">
                  {smartAccountAddr}
                </code>
              </div>
            )}

            {/* Default limits summary */}
            <div className="rounded-md border bg-muted/30 p-3 space-y-1">
              <p className="text-sm font-medium">Default Limits</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  <DollarSign className="mr-0.5 inline h-3 w-3" />
                  {spendLimitPerTx} USDC per transaction
                </span>
                <span>
                  <DollarSign className="mr-0.5 inline h-3 w-3" />
                  {spendLimitDaily} USDC daily limit
                </span>
                <span>
                  <Clock className="mr-0.5 inline h-3 w-3" />
                  {expiryDays} day expiry
                </span>
              </div>
            </div>

            {/* Advanced settings toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showAdvanced ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              Advanced settings
            </button>

            {showAdvanced && (
              <div className="space-y-3 border-l-2 border-muted pl-3">
                {/* Spend limit per transaction */}
                <div className="space-y-1.5">
                  <Label
                    htmlFor="onb-spend-per-tx"
                    className="flex items-center gap-1 text-xs"
                  >
                    <DollarSign className="h-3 w-3" />
                    Spend Limit Per Transaction (USDC)
                  </Label>
                  <Input
                    id="onb-spend-per-tx"
                    type="number"
                    placeholder="50"
                    value={spendLimitPerTx}
                    onChange={(e) => setSpendLimitPerTx(e.target.value)}
                    min="0"
                    step="1"
                    disabled={isProcessing}
                  />
                </div>

                {/* Daily spend limit */}
                <div className="space-y-1.5">
                  <Label
                    htmlFor="onb-spend-daily"
                    className="flex items-center gap-1 text-xs"
                  >
                    <DollarSign className="h-3 w-3" />
                    Daily Spend Limit (USDC)
                  </Label>
                  <Input
                    id="onb-spend-daily"
                    type="number"
                    placeholder="500"
                    value={spendLimitDaily}
                    onChange={(e) => setSpendLimitDaily(e.target.value)}
                    min="0"
                    step="1"
                    disabled={isProcessing}
                  />
                </div>

                {/* Expiry period */}
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1 text-xs">
                    <Clock className="h-3 w-3" />
                    Expiry Period
                  </Label>
                  <Select
                    value={expiryDays}
                    onValueChange={setExpiryDays}
                    disabled={isProcessing}
                  >
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
              </div>
            )}

            {/* Wallet signature explanation */}
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
              <p className="text-xs text-amber-800 dark:text-amber-200">
                <Shield className="mr-1 inline h-3 w-3" />
                You will be asked to approve a transaction in your wallet. This
                installs the session key permission on your smart account. Gas
                is sponsored — no ETH needed.
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              onClick={() => {
                setSubStep("authorizing");
                handleAuthorize();
              }}
              disabled={!walletClient || isProcessing}
              className="w-full"
            >
              Authorize Session Key
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Sub-step 3: Authorizing (in progress) */}
      {subStep === "authorizing" && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <div className="text-center">
              <p className="font-medium">
                {authStatus ? AUTH_STATUS_LABELS[authStatus] : "Processing..."}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {authStatus === "signing"
                  ? "Check your wallet for a signature request"
                  : "This may take a moment"}
              </p>
            </div>

            {smartAccountAddr && (
              <div className="mt-2 space-y-1 text-center">
                <Label className="text-xs text-muted-foreground">
                  Smart Account
                </Label>
                <code className="block text-xs font-mono text-muted-foreground">
                  {smartAccountAddr}
                </code>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sub-step 4: Done */}
      {subStep === "done" && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-8">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <div className="text-center">
              <p className="font-medium">Smart Account Ready</p>
              {smartAccountAddr && (
                <code className="mt-1 block text-xs font-mono text-muted-foreground">
                  {smartAccountAddr}
                </code>
              )}
            </div>
            <Badge variant="secondary">Session key authorized</Badge>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Small dot indicator for sub-step progress. */
function SubStepDot({
  active,
  completed,
}: {
  active: boolean;
  completed: boolean;
}) {
  return (
    <div
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
        completed
          ? "border-green-500 bg-green-500 text-white"
          : active
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/30 bg-muted"
      }`}
    >
      {completed ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : active ? (
        <div className="h-1.5 w-1.5 rounded-full bg-current" />
      ) : null}
    </div>
  );
}

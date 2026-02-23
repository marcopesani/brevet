"use client";

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWalletClient } from "wagmi";
import { createPublicClient, http, custom, zeroAddress, type Hex, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createKernelAccount, createKernelAccountClient, createZeroDevPaymasterClient } from "@zerodev/sdk";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { toPermissionValidator, serializePermissionAccount } from "@zerodev/permissions";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { Wallet, Key, Shield, Check, Loader2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
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
  setupSmartAccount,
  prepareSessionKeyAuth,
  sendBundlerRequest,
  finalizeSessionKey,
} from "@/app/actions/smart-account";
import { ENTRY_POINT, KERNEL_VERSION, buildSessionKeyPolicies } from "@/lib/smart-account-policies";
import { getChainById, getUsdcGasTokenAddress } from "@/lib/chain-config";

interface SetupDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chainId: number;
  smartAccountAddress?: string;
  sessionKeyStatus?: string;
}

type SetupStep = "create" | "configure" | "authorize" | "complete";

const EXPIRY_OPTIONS = [
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
  { value: "60", label: "60 days" },
  { value: "90", label: "90 days" },
];

export function SetupDrawer({
  open,
  onOpenChange,
  chainId,
  smartAccountAddress,
  sessionKeyStatus,
}: SetupDrawerProps) {
  const queryClient = useQueryClient();
  const { data: walletClient } = useWalletClient();

  const [step, setStep] = useState<SetupStep>(
    smartAccountAddress && sessionKeyStatus === "pending_grant" ? "configure" : "create"
  );
  const [spendLimitPerTx, setSpendLimitPerTx] = useState("50");
  const [spendLimitDaily, setSpendLimitDaily] = useState("500");
  const [expiryDays, setExpiryDays] = useState("30");
  const [authStatus, setAuthStatus] = useState<string | null>(null);

  // Reset step when drawer opens
  useEffect(() => {
    if (open) {
      if (smartAccountAddress && sessionKeyStatus === "pending_grant") {
        setStep("configure");
      } else {
        setStep("create");
      }
      setAuthStatus(null);
    }
  }, [open, smartAccountAddress, sessionKeyStatus]);

  // Smart account creation mutation
  const { mutate: createAccount, isPending: isCreating } = useMutation({
    mutationFn: () => setupSmartAccount(chainId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["smart-account", chainId] });
      setStep("configure");
      toast.success("Smart account created");

      // Haptic feedback
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(10);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create account");
    },
  });

  // Session key authorization mutation
  const { mutate: authorizeSessionKey, isPending: isAuthorizing } = useMutation({
    mutationFn: async () => {
      setAuthStatus("preparing");

      // Get session key from server
      const { sessionKeyHex, smartAccountAddress: saAddress } =
        await prepareSessionKeyAuth(chainId);

      if (!walletClient) throw new Error("Wallet not connected");

      setAuthStatus("building");

      // Build validators
      const config = getChainById(chainId);
      if (!config) throw new Error(`Unsupported chain: ${chainId}`);

      const publicClient = createPublicClient({
        chain: config.chain,
        transport: http(undefined, { batch: { wait: 50 }, retryCount: 0 }),
        batch: { multicall: true },
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

      const spendLimitPerTxMicro = BigInt(
        Math.round((parseFloat(spendLimitPerTx) || 50) * 1e6),
      );

      const permissionValidator = await toPermissionValidator(publicClient, {
        signer: ecdsaSigner,
        policies: buildSessionKeyPolicies(
          config.usdcAddress as Address,
          expiryTimestamp,
          spendLimitPerTxMicro,
        ),
        entryPoint: ENTRY_POINT,
        kernelVersion: KERNEL_VERSION,
      });

      // Build Kernel account
      const kernelAccount = await createKernelAccount(publicClient, {
        entryPoint: ENTRY_POINT,
        kernelVersion: KERNEL_VERSION,
        plugins: {
          sudo: ecdsaValidator,
          regular: permissionValidator,
        },
        address: saAddress as Address,
      });

      // Build bundler transport
      const bundlerTransport = custom(
        {
          async request({ method, params }: { method: string; params?: unknown }) {
            return sendBundlerRequest(chainId, method, (params ?? []) as unknown[]);
          },
        },
        { retryCount: 0 },
      );

      const paymasterClient = createZeroDevPaymasterClient({
        chain: config.chain,
        transport: bundlerTransport,
      });

      const gasToken = getUsdcGasTokenAddress(chainId);

      const kernelClient = createKernelAccountClient({
        account: kernelAccount,
        chain: config.chain,
        bundlerTransport,
        client: publicClient,
        paymaster: {
          async getPaymasterStubData(userOperation) {
            try {
              return await paymasterClient.sponsorUserOperation({
                userOperation,
                shouldConsume: false,
              });
            } catch {
              if (!gasToken) throw new Error("Gas sponsorship unavailable");
              return paymasterClient.sponsorUserOperation({
                userOperation,
                gasToken,
                shouldConsume: false,
              });
            }
          },
          async getPaymasterData(userOperation) {
            try {
              return await paymasterClient.sponsorUserOperation({ userOperation });
            } catch {
              if (!gasToken) throw new Error("Gas sponsorship unavailable");
              return paymasterClient.sponsorUserOperation({ userOperation, gasToken });
            }
          },
        },
      });

      // Send UserOp
      setAuthStatus("signing");
      const userOpHash = await kernelClient.sendUserOperation({
        callData: await kernelAccount.encodeCalls([
          { to: zeroAddress, value: BigInt(0), data: "0x" },
        ]),
      });

      // Wait for confirmation
      setAuthStatus("confirming");
      const receipt = await kernelClient.waitForUserOperationReceipt({
        hash: userOpHash,
        timeout: 120_000,
      });

      if (!receipt.success) throw new Error("Transaction failed on-chain");

      // Serialize and finalize
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
        Number(spendLimitPerTxMicro),
        Math.round((parseFloat(spendLimitDaily) || 500) * 1e6),
        parseInt(expiryDays, 10) || 30,
      );

      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["smart-account", chainId] });
      if (!result.success) {
        toast.error(result.error ?? "Authorization failed");
        return;
      }
      setStep("complete");
      setAuthStatus(null);
      toast.success("Session key authorized!");

      // Haptic feedback
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([10, 50, 10]);
      }

      // Close after delay
      setTimeout(() => {
        onOpenChange(false);
      }, 2000);
    },
    onError: (error: Error) => {
      setAuthStatus(null);
      toast.error(error.message || "Authorization failed");
    },
  });

  const chainConfig = getChainById(chainId);

  function StepIndicator() {
    const steps: { id: SetupStep; icon: React.ReactNode }[] = [
      { id: "create", icon: <Wallet className="h-4 w-4" /> },
      { id: "configure", icon: <Key className="h-4 w-4" /> },
      { id: "authorize", icon: <Shield className="h-4 w-4" /> },
    ];

    const currentIndex = steps.findIndex((s) => s.id === step);

    return (
      <div className="flex items-center justify-center gap-2 py-4">
        {steps.map((s, index) => {
          const isActive = s.id === step;
          const isComplete = currentIndex > index;

          return (
            <div key={s.id} className="flex items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-all duration-300 ${
                  isActive
                    ? "scale-110 bg-primary text-primary-foreground animate-pulse"
                    : isComplete
                      ? "bg-green-500 text-white"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {isComplete ? <Check className="h-4 w-4" /> : s.icon}
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`mx-2 h-0.5 w-8 transition-colors duration-300 ${
                    currentIndex > index ? "bg-green-500" : "bg-muted"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function getStatusText() {
    switch (authStatus) {
      case "preparing":
        return "Preparing...";
      case "building":
        return "Building transaction...";
      case "signing":
        return "Sign in your wallet...";
      case "confirming":
        return "Confirming on-chain...";
      case "finalizing":
        return "Finalizing...";
      default:
        return "";
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader>
          <DrawerTitle>
            {step === "create" && "Create Smart Account"}
            {step === "configure" && "Configure Session Key"}
            {step === "authorize" && "Authorize Session Key"}
            {step === "complete" && "Setup Complete"}
          </DrawerTitle>
        </DrawerHeader>

        <StepIndicator />

        <div className="space-y-4 px-4 pb-6">
          {/* Step 1: Create Account */}
          {step === "create" && (
            <>
              <div className="rounded-lg bg-muted p-4">
                <p className="text-sm">
                  Create a smart account on {chainConfig?.displayName} to enable
                  AI agent payments.
                </p>
              </div>
              <Button
                className="w-full"
                onClick={() => createAccount()}
                disabled={isCreating}
              >
                {isCreating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Wallet className="mr-2 h-4 w-4" />
                    Create Account
                  </>
                )}
              </Button>
            </>
          )}

          {/* Step 2: Configure Session Key */}
          {step === "configure" && (
            <>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="spend-limit-per-tx">
                    Spend Limit Per Transaction (USDC)
                  </Label>
                  <Input
                    id="spend-limit-per-tx"
                    type="number"
                    value={spendLimitPerTx}
                    onChange={(e) => setSpendLimitPerTx(e.target.value)}
                    min="0"
                    step="1"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="spend-limit-daily">
                    Daily Spend Limit (USDC)
                  </Label>
                  <Input
                    id="spend-limit-daily"
                    type="number"
                    value={spendLimitDaily}
                    onChange={(e) => setSpendLimitDaily(e.target.value)}
                    min="0"
                    step="1"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Expiry Period</Label>
                  <Select value={expiryDays} onValueChange={setExpiryDays}>
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

              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  <Shield className="mb-1 mr-1 inline h-3 w-3" />
                  This will submit a transaction to authorize your AI agent to
                  make payments on your behalf.
                </p>
              </div>

              <Button className="w-full" onClick={() => setStep("authorize")}>
                Continue
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </>
          )}

          {/* Step 3: Authorize */}
          {step === "authorize" && (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Per-tx limit</span>
                  <span className="font-medium">${spendLimitPerTx} USDC</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Daily limit</span>
                  <span className="font-medium">${spendLimitDaily} USDC</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Expires in</span>
                  <span className="font-medium">
                    {EXPIRY_OPTIONS.find((o) => o.value === expiryDays)?.label}
                  </span>
                </div>
              </div>

              {authStatus && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {getStatusText()}
                </div>
              )}

              <Button
                className="w-full"
                onClick={() => authorizeSessionKey()}
                disabled={isAuthorizing || !walletClient}
              >
                {isAuthorizing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Authorizing...
                  </>
                ) : (
                  <>
                    <Key className="mr-2 h-4 w-4" />
                    Authorize in Wallet
                  </>
                )}
              </Button>

              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setStep("configure")}
                disabled={isAuthorizing}
              >
                Back to Configuration
              </Button>
            </>
          )}

          {/* Step 4: Complete */}
          {step === "complete" && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
                <Check className="h-8 w-8 text-green-500" />
              </div>
              <p className="text-center text-sm text-muted-foreground">
                Your smart account is ready for AI agent payments!
              </p>
              <Button onClick={() => onOpenChange(false)} className="w-full">
                Done
              </Button>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

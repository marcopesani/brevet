"use client";

import { useCallback, useState } from "react";
import { useSignTypedData, useAccount, useSwitchChain } from "wagmi";
import { authorizationTypes } from "@x402/evm";
import type { PaymentRequirements } from "@x402/core/types";
import { useQueryClient } from "@tanstack/react-query";
import type { Hex } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { toast } from "sonner";
import { getChainById, getNetworkIdentifiers, type ChainConfig } from "@/lib/chain-config";
import { formatAmountForDisplay } from "@/lib/x402/display";
import { getRequirementAmount, getRequirementAmountFromLike } from "@/lib/x402/requirements";
import { approvePendingPayment, rejectPendingPayment } from "@/app/actions/payments";
import { PENDING_PAYMENTS_QUERY_KEY } from "@/hooks/use-pending-payments";
import { WALLET_BALANCE_QUERY_KEY } from "@/hooks/use-wallet-balance";

export interface PendingPayment {
  id: string;
  url: string;
  amount?: number;
  amountRaw?: string;
  asset?: string;
  chainId?: number;
  paymentRequirements: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export type SigningStatus =
  | "idle"
  | "switching"
  | "signing"
  | "submitting"
  | "success"
  | "error";

function generateNonce(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex}` as Hex;
}

export interface SigningResult {
  success: boolean;
  error?: string;
}

export function usePaymentSigning(
  payment: PendingPayment,
  walletAddress: string,
  activeChain: ChainConfig,
  onComplete?: () => void,
) {
  const [status, setStatus] = useState<SigningStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const { signTypedDataAsync } = useSignTypedData();
  const { chainId: walletChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const queryClient = useQueryClient();

  // Parse requirements
  const parsedRequirements = JSON.parse(payment.paymentRequirements);
  const isFullFormat = !Array.isArray(parsedRequirements) && parsedRequirements.accepts;
  const accepts: PaymentRequirements[] = isFullFormat
    ? parsedRequirements.accepts
    : Array.isArray(parsedRequirements)
      ? parsedRequirements
      : [parsedRequirements];

  // Determine payment chain
  const paymentChainConfig = payment.chainId !== undefined
    ? getChainById(payment.chainId) ?? activeChain
    : activeChain;

  // Resolve the requirement for this chain
  const acceptedNetworks = getNetworkIdentifiers(paymentChainConfig);
  const requirement = accepts.find(
    (r: PaymentRequirements) =>
      r.scheme === "exact" && r.network != null && acceptedNetworks.includes(r.network),
  ) ?? accepts[0];

  // Get display amount
  const amountStr =
    getRequirementAmount(requirement) ??
    payment.amountRaw ??
    getRequirementAmountFromLike(requirement);
  const amountForDisplay =
    amountStr != null
      ? formatAmountForDisplay(
          amountStr,
          payment.asset ?? requirement?.asset,
          payment.chainId ?? paymentChainConfig.chain.id,
        )
      : payment.amount != null && payment.amount > 0
        ? { displayAmount: payment.amount.toFixed(6), symbol: "USDC" }
        : { displayAmount: "—", symbol: "" };

  const amountLabel =
    amountForDisplay.displayAmount === "—"
      ? "Unknown"
      : `${amountForDisplay.displayAmount} ${amountForDisplay.symbol}`.trim();

  const invalidateAndNotify = useCallback(async () => {
    queryClient.invalidateQueries({ queryKey: PENDING_PAYMENTS_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: WALLET_BALANCE_QUERY_KEY });
    onComplete?.();
  }, [queryClient, onComplete]);

  const approve = useCallback(async (): Promise<SigningResult> => {
    setStatus("switching");
    setError(null);

    try {
      if (!requirement) {
        throw new Error("No supported payment requirement found");
      }
      if (!requirement.payTo) {
        throw new Error("Payment requirement missing payTo address");
      }
      const amountRaw =
        getRequirementAmount(requirement) ?? getRequirementAmountFromLike(requirement);
      if (amountRaw == null || amountRaw === "") {
        throw new Error("Payment requirement has no amount; cannot approve");
      }

      const amountWei = BigInt(amountRaw);
      const nonce = generateNonce();
      const now = BigInt(Math.floor(Date.now() / 1_000));

      // Switch chain if needed
      if (walletChainId !== paymentChainConfig.chain.id) {
        try {
          await switchChainAsync({ chainId: paymentChainConfig.chain.id });
        } catch {
          throw new Error("Failed to switch network");
        }
      }

      setStatus("signing");

      const authorization = {
        from: walletAddress as Hex,
        to: requirement.payTo as Hex,
        value: amountWei,
        validAfter: BigInt(0),
        validBefore: now + BigInt(300),
        nonce,
      };

      const typedDataPayload = {
        domain: paymentChainConfig.usdcDomain,
        types: authorizationTypes,
        primaryType: "TransferWithAuthorization" as const,
        message: {
          from: authorization.from,
          to: authorization.to,
          value: authorization.value,
          validAfter: authorization.validAfter,
          validBefore: authorization.validBefore,
          nonce: authorization.nonce,
        },
      };

      const signature =
        process.env.NEXT_PUBLIC_TEST_MODE === "true"
          ? await mnemonicToAccount(
              process.env.NEXT_PUBLIC_E2E_METAMASK_SEED_PHRASE ??
                "test test test test test test test test test test test junk",
            ).signTypedData(typedDataPayload)
          : await signTypedDataAsync(typedDataPayload);

      setStatus("submitting");

      const result = await approvePendingPayment(payment.id, signature, {
        from: authorization.from,
        to: authorization.to,
        value: authorization.value.toString(),
        validAfter: authorization.validAfter.toString(),
        validBefore: authorization.validBefore.toString(),
        nonce: authorization.nonce,
      });

      setStatus("success");

      if (result.success) {
        toast.success("Payment approved!");
      } else {
        toast.error("Payment failed");
      }

      await invalidateAndNotify();
      return { success: result.success };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to sign transaction";
      setError(message);
      setStatus("error");
      toast.error(message);
      return { success: false, error: message };
    }
  }, [
    requirement,
    walletAddress,
    payment.id,
    walletChainId,
    paymentChainConfig,
    signTypedDataAsync,
    switchChainAsync,
    invalidateAndNotify,
  ]);

  const reject = useCallback(async (): Promise<SigningResult> => {
    setStatus("submitting");
    setError(null);

    try {
      await rejectPendingPayment(payment.id);
      toast.success("Payment rejected");
      await invalidateAndNotify();
      setStatus("idle");
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reject payment";
      setError(message);
      setStatus("error");
      toast.error(message);
      return { success: false, error: message };
    }
  }, [payment.id, invalidateAndNotify]);

  return {
    status,
    error,
    approve,
    reject,
    requirement,
    amountLabel,
    paymentChainConfig,
    amountStr,
  };
}

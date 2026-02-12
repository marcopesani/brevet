import type { Hex } from "viem";
import { formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { prisma } from "@/lib/db";
import { decryptPrivateKey, USDC_DECIMALS } from "@/lib/hot-wallet";
import { checkPolicy } from "@/lib/policy";
import {
  buildTransferAuthorization,
  signTransferAuthorization,
} from "./eip712";
import { parsePaymentRequired, buildPaymentSignatureHeader } from "./headers";
import type { PaymentResult, PaymentRequirement } from "./types";

/**
 * Execute the full x402 payment flow for a given URL.
 *
 * 1. Fetch the URL
 * 2. If 402 → parse payment requirements
 * 3. Check spending policy
 * 4. Sign EIP-712 TransferWithAuthorization with hot wallet
 * 5. Re-request with PAYMENT-SIGNATURE header
 * 6. Log transaction to database
 *
 * @param url    The x402-protected endpoint
 * @param userId The user whose hot wallet and policy to use
 */
export async function executePayment(
  url: string,
  userId: string,
): Promise<PaymentResult> {
  // Step 1: Initial request
  const initialResponse = await fetch(url);

  if (initialResponse.status !== 402) {
    // Not a paid endpoint — return the response as-is
    return { success: true, response: initialResponse };
  }

  // Step 2: Parse payment requirements
  const requirements = parsePaymentRequired(initialResponse);
  if (!requirements || requirements.length === 0) {
    return {
      success: false,
      error: "Received 402 but no valid payment requirements in headers",
    };
  }

  // Use the first requirement that matches our supported scheme/network
  const requirement = requirements.find(
    (r): r is PaymentRequirement =>
      r.scheme === "exact" && r.network === "eip155:8453",
  );

  if (!requirement) {
    return {
      success: false,
      error:
        "No supported payment requirement found (need scheme=exact, network=eip155:8453)",
    };
  }

  // Step 3: Look up the user's hot wallet
  const hotWallet = await prisma.hotWallet.findUnique({
    where: { userId },
  });

  if (!hotWallet) {
    return { success: false, error: "No hot wallet found for user" };
  }

  const privateKey = decryptPrivateKey(hotWallet.encryptedPrivateKey) as Hex;
  const account = privateKeyToAccount(privateKey);

  // Calculate amount in human-readable USD for policy check
  const amountWei = BigInt(requirement.maxAmountRequired);
  const amountUsd = parseFloat(formatUnits(amountWei, USDC_DECIMALS));

  // Step 4: Check spending policy
  const policyResult = await checkPolicy(amountUsd, url, userId);
  if (!policyResult.allowed) {
    return {
      success: false,
      error: `Policy denied: ${policyResult.reason}`,
    };
  }

  // Step 5: Build and sign the EIP-712 message
  const authorization = buildTransferAuthorization(
    account.address,
    requirement.payTo,
    amountWei,
  );

  const signature = await signTransferAuthorization(authorization, privateKey);
  const paymentHeader = buildPaymentSignatureHeader(signature, authorization);

  // Step 6: Re-request with payment header
  const paidResponse = await fetch(url, {
    headers: {
      "PAYMENT-SIGNATURE": paymentHeader,
    },
  });

  // Step 7: Log transaction
  const txStatus = paidResponse.ok ? "completed" : "failed";
  await prisma.transaction.create({
    data: {
      amount: amountUsd,
      endpoint: url,
      network: "base",
      status: txStatus,
      userId,
    },
  });

  if (!paidResponse.ok) {
    return {
      success: false,
      error: `Payment submitted but server responded with ${paidResponse.status}`,
      response: paidResponse,
    };
  }

  return { success: true, response: paidResponse };
}

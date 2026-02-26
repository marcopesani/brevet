"use server";

import { revalidatePath } from "next/cache";
import { type Hex } from "viem";
import { z } from "zod/v4";
import { getAuthenticatedUser } from "@/lib/auth";
import { type ActionResult, ok, err } from "@/lib/action-result";
import { withAuth } from "@/lib/action-result-server";
import {
  ALLOWED_BUNDLER_METHODS,
  toHumanReadableBundlerError,
  extractJsonRpcError,
} from "@/lib/bundler-errors";
import {
  ensureSmartAccount,
  getSmartAccount,
  getSmartAccountWithSessionKey,
  getSmartAccountBalance,
  getAllSmartAccounts,
  storeSerializedAccount,
  activateSessionKey,
  withdrawFromSmartAccount,
} from "@/lib/data/smart-account";
import { decryptPrivateKey, encryptPrivateKey } from "@/lib/encryption";
import { createChainPublicClient, getChainById, getZeroDevBundlerRpc } from "@/lib/chain-config";
import {
  SESSION_KEY_MAX_SPEND_PER_TX,
  SESSION_KEY_MAX_SPEND_DAILY,
  SESSION_KEY_MAX_EXPIRY_DAYS,
} from "@/lib/smart-account-constants";

// ---------------------------------------------------------------------------
// Reads — keep throwing (consumed by Server Components / error boundaries)
// ---------------------------------------------------------------------------

export async function getSmartAccountForChain(chainId: number) {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  return getSmartAccount(auth.userId, chainId);
}

export async function getSmartAccountBalanceAction(chainId?: number) {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  return getSmartAccountBalance(auth.userId, chainId);
}

export async function getAllSmartAccountsAction() {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  return getAllSmartAccounts(auth.userId);
}

// ---------------------------------------------------------------------------
// Mutations — return ActionResult<T>
// ---------------------------------------------------------------------------

export async function setupSmartAccount(chainId: number) {
  return withAuth(async (auth) => {
    const account = await ensureSmartAccount(
      auth.userId,
      auth.walletAddress,
      chainId,
    );

    revalidatePath("/dashboard/wallet");
    revalidatePath("/dashboard");

    return ok({
      _id: account._id,
      smartAccountAddress: account.smartAccountAddress,
      chainId: account.chainId,
      sessionKeyStatus: account.sessionKeyStatus,
    });
  });
}

export async function withdrawFromWallet(
  amount: number,
  toAddress: string,
  chainId?: number,
) {
  return withAuth(async (auth) => {
    const result = await withdrawFromSmartAccount(
      auth.userId,
      amount,
      toAddress,
      chainId,
    );

    revalidatePath("/dashboard/wallet");
    revalidatePath("/dashboard/transactions");

    return ok(result);
  });
}

/**
 * Step 1: Prepare session key data for client-side signing.
 * Returns the decrypted session key hex so the client can build the
 * permission validator and sign the enable UserOp via WalletConnect.
 */
export async function prepareSessionKeyAuth(chainId: number) {
  return withAuth(async (auth) => {
    const account = await getSmartAccountWithSessionKey(auth.userId, chainId);
    if (!account) return err("Smart account not found");
    if (account.sessionKeyStatus !== "pending_grant") {
      return err(
        `Session key cannot be authorized — current status: ${account.sessionKeyStatus}`,
      );
    }

    const sessionKeyHex = decryptPrivateKey(account.sessionKeyEncrypted);

    return ok({
      sessionKeyHex,
      smartAccountAddress: account.smartAccountAddress,
      ownerAddress: account.ownerAddress,
      chainId,
    });
  });
}

/**
 * Step 2: Proxy JSON-RPC calls to the ZeroDev bundler/paymaster.
 * Only allows a strict set of methods — no arbitrary RPC forwarding.
 */
export async function sendBundlerRequest(
  chainId: number,
  method: string,
  params: unknown[],
): Promise<ActionResult<unknown>> {
  return withAuth(async (auth) => {
    if (!ALLOWED_BUNDLER_METHODS.has(method)) {
      return err(`Method not allowed: ${method}`);
    }

    if (method === "eth_sendUserOperation" && Array.isArray(params) && params.length > 0) {
      const userOp = params[0] as Record<string, unknown> | undefined;
      const sender = userOp?.sender;
      if (typeof sender === "string") {
        const account = await getSmartAccount(auth.userId, chainId);
        if (!account) {
          return err("No smart account found for this chain");
        }
        if (sender.toLowerCase() !== account.smartAccountAddress.toLowerCase()) {
          return err("UserOperation sender does not match your smart account");
        }
      }
    }

    const rpcUrl = getZeroDevBundlerRpc(chainId);

    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });

    const json = await response.json();
    if (json.error) {
      const raw = extractJsonRpcError(json.error);
      return err(toHumanReadableBundlerError(raw));
    }

    return ok(json.result);
  });
}

const finalizeSessionKeySchema = z.object({
  chainId: z.number().int().positive(),
  grantTxHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  serializedAccount: z.string().min(1),
  spendLimitPerTx: z.number().int().positive().max(SESSION_KEY_MAX_SPEND_PER_TX),
  spendLimitDaily: z.number().int().positive().max(SESSION_KEY_MAX_SPEND_DAILY),
  expiryDays: z.number().int().min(1).max(SESSION_KEY_MAX_EXPIRY_DAYS),
});

/**
 * Step 3: Finalize after the client-side UserOp is confirmed on-chain.
 * Verifies the grant tx, stores the serialized account, and activates the session key.
 *
 * spendLimitPerTx and spendLimitDaily are in USDC micro-units (multiply USDC by 10^6).
 */
export async function finalizeSessionKey(
  chainId: number,
  grantTxHash: string,
  serializedAccount: string,
  spendLimitPerTx: number,
  spendLimitDaily: number,
  expiryDays: number,
) {
  return withAuth(async (auth) => {
    const parsed = finalizeSessionKeySchema.safeParse({
      chainId,
      grantTxHash,
      serializedAccount,
      spendLimitPerTx,
      spendLimitDaily,
      expiryDays,
    });
    if (!parsed.success) {
      return err(
        `Invalid input: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
      );
    }

    const config = getChainById(chainId);
    if (!config) return err(`Unsupported chain: ${chainId}`);

    const publicClient = createChainPublicClient(chainId);
    const receipt = await publicClient.getTransactionReceipt({
      hash: grantTxHash as Hex,
    });
    if (receipt.status !== "success") {
      return err("Grant transaction failed");
    }

    const serializedEncrypted = encryptPrivateKey(serializedAccount);
    await storeSerializedAccount(auth.userId, chainId, serializedEncrypted);

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + expiryDays);

    await activateSessionKey(
      auth.userId,
      chainId,
      grantTxHash,
      expiryDate,
      spendLimitPerTx,
      spendLimitDaily,
    );

    revalidatePath("/dashboard/wallet");
    revalidatePath("/dashboard");

    return ok({
      grantTxHash,
      sessionKeyStatus: "active" as const,
    });
  });
}

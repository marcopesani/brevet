"use server";

import { revalidatePath } from "next/cache";
import { createPublicClient, http, type Hex } from "viem";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  ensureSmartAccount,
  getSmartAccount,
  getSmartAccountWithSessionKey,
  getSmartAccountBalance,
  getAllSmartAccounts,
  storeSerializedAccount,
} from "@/lib/data/smart-account";
import { decryptPrivateKey, encryptPrivateKey } from "@/lib/hot-wallet";
import { getChainConfig } from "@/lib/chain-config";

export async function setupSmartAccount(chainId: number) {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  const account = await ensureSmartAccount(
    auth.userId,
    auth.walletAddress,
    chainId,
  );

  revalidatePath("/dashboard/wallet");
  revalidatePath("/dashboard");
  return {
    id: account.id,
    smartAccountAddress: account.smartAccountAddress,
    chainId: account.chainId,
    sessionKeyStatus: account.sessionKeyStatus,
  };
}

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

// Allowed bundler/paymaster JSON-RPC methods for sendBundlerRequest
const ALLOWED_BUNDLER_METHODS = new Set([
  "eth_sendUserOperation",
  "eth_estimateUserOperationGas",
  "pimlico_getUserOperationGasPrice",
  "pm_getPaymasterData",
  "pm_getPaymasterStubData",
  "eth_getUserOperationReceipt",
]);

/**
 * Step 1: Prepare session key data for client-side signing.
 * Returns the decrypted session key hex so the client can build the
 * permission validator and sign the enable UserOp via WalletConnect.
 */
export async function prepareSessionKeyAuth(chainId: number) {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  const account = await getSmartAccountWithSessionKey(auth.userId, chainId);
  if (!account) throw new Error("Smart account not found");
  if (account.sessionKeyStatus !== "pending_grant") {
    throw new Error(
      `Session key cannot be authorized — current status: ${account.sessionKeyStatus}`,
    );
  }

  const sessionKeyHex = decryptPrivateKey(account.sessionKeyEncrypted);

  return {
    sessionKeyHex,
    smartAccountAddress: account.smartAccountAddress,
    ownerAddress: account.ownerAddress,
    chainId,
  };
}

/**
 * Step 2: Proxy JSON-RPC calls to the Pimlico bundler/paymaster.
 * Only allows a strict set of methods — no arbitrary RPC forwarding.
 */
export async function sendBundlerRequest(
  chainId: number,
  method: string,
  params: unknown[],
) {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  if (!ALLOWED_BUNDLER_METHODS.has(method)) {
    throw new Error(`Method not allowed: ${method}`);
  }

  const apiKey = process.env.PIMLICO_API_KEY;
  if (!apiKey) throw new Error("PIMLICO_API_KEY is not set");
  const bundlerUrl = `https://api.pimlico.io/v2/${chainId}/rpc?apikey=${apiKey}`;

  const response = await fetch(bundlerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

  const json = await response.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

/**
 * Step 3: Finalize after the client-side UserOp is confirmed on-chain.
 * Verifies the grant tx, stores the serialized account, and activates the session key.
 */
export async function finalizeSessionKey(
  chainId: number,
  grantTxHash: string,
  serializedAccount: string,
  spendLimitPerTx: number,
  spendLimitDaily: number,
  expiryDays: number,
) {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  // Verify the grant transaction on-chain
  const config = getChainConfig(chainId);
  if (!config) throw new Error(`Unsupported chain: ${chainId}`);

  const publicClient = createPublicClient({
    chain: config.chain,
    transport: http(),
  });
  const receipt = await publicClient.getTransactionReceipt({
    hash: grantTxHash as Hex,
  });
  if (receipt.status !== "success") {
    throw new Error("Grant transaction failed");
  }

  // Encrypt and store the serialized permission account
  const serializedEncrypted = encryptPrivateKey(serializedAccount);
  await storeSerializedAccount(auth.userId, chainId, serializedEncrypted);

  // Compute expiry date
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + expiryDays);

  // Update SmartAccount record
  const { SmartAccount } = await import("@/lib/models/smart-account");
  await SmartAccount.findOneAndUpdate(
    { userId: auth.userId, chainId },
    {
      $set: {
        sessionKeyStatus: "active",
        sessionKeyGrantTxHash: grantTxHash,
        sessionKeyExpiry: expiryDate,
        spendLimitPerTx,
        spendLimitDaily,
      },
    },
  );

  revalidatePath("/dashboard/wallet");
  revalidatePath("/dashboard");

  return {
    success: true,
    grantTxHash,
    sessionKeyStatus: "active" as const,
  };
}

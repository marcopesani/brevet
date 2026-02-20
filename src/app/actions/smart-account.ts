"use server";

import { revalidatePath } from "next/cache";
import { createPublicClient, http, type Hex, type Address, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { entryPoint07Address } from "viem/account-abstraction";
import { createKernelAccount, createKernelAccountClient } from "@zerodev/sdk";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { toPermissionValidator, serializePermissionAccount } from "@zerodev/permissions";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { toSudoPolicy } from "@zerodev/permissions/policies";
import { createPimlicoClient } from "permissionless/clients/pimlico";
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

const ENTRY_POINT = {
  address: entryPoint07Address,
  version: "0.7" as const,
};

const KERNEL_VERSION = "0.3.3" as const;

// Pimlico bundler URL — requires PIMLICO_API_KEY env var
function getBundlerUrl(chainId: number): string {
  const apiKey = process.env.PIMLICO_API_KEY;
  if (!apiKey) throw new Error("PIMLICO_API_KEY is not set");
  return `https://api.pimlico.io/v2/${chainId}/rpc?apikey=${apiKey}`;
}

export async function authorizeSessionKey(
  chainId: number,
  spendLimitPerTx: number,
  spendLimitDaily: number,
  expiryDays: number,
) {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  // 1. Fetch account with encrypted session key
  const account = await getSmartAccountWithSessionKey(auth.userId, chainId);
  if (!account) throw new Error("Smart account not found");
  if (account.sessionKeyStatus === "active") {
    throw new Error("Session key already authorized");
  }

  const config = getChainConfig(chainId);
  if (!config) throw new Error(`Unsupported chain: ${chainId}`);

  // 2. Decrypt session key
  const sessionKeyHex = decryptPrivateKey(account.sessionKeyEncrypted) as Hex;
  const sessionKeyAccount = privateKeyToAccount(sessionKeyHex);

  // 3. Create owner ECDSA validator (sudo) — uses the owner's wallet address
  //    The owner private key is NOT available server-side, but the owner signed
  //    the account creation. For a Kernel v3.3 account, the enable signature
  //    for the regular plugin is embedded in the UserOp's signature by the SDK.
  //    We need the owner's private key here to sign the enable data.
  //    The owner key is stored encrypted in the hot wallet (legacy flow).
  //    For non-custodial accounts, the owner is the user's external wallet —
  //    we use the session key flow where the bundler UserOp installs the plugin.
  //
  //    NOTE: In the current architecture, the owner EOA private key is available
  //    via the hot wallet system. We use it to sign the enable UserOp.
  const { HotWallet } = await import("@/lib/models/hot-wallet");
  const { connectDB } = await import("@/lib/db");
  await connectDB();
  const hotWallet = await HotWallet.findOne({ userId: account.userId }).lean();
  if (!hotWallet) throw new Error("Hot wallet not found — cannot sign enable UserOp");
  const ownerKeyHex = decryptPrivateKey(hotWallet.encryptedPrivateKey) as Hex;
  const ownerAccount = privateKeyToAccount(ownerKeyHex);

  const publicClient = createPublicClient({
    chain: config.chain,
    transport: http(),
  });

  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer: ownerAccount,
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_VERSION,
  });

  // 4. Create session key permission validator (regular)
  const ecdsaSigner = await toECDSASigner({
    signer: sessionKeyAccount,
  });

  const permissionValidator = await toPermissionValidator(publicClient, {
    signer: ecdsaSigner,
    policies: [toSudoPolicy({})],
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_VERSION,
  });

  // 5. Create Kernel account with both validators
  const kernelAccount = await createKernelAccount(publicClient, {
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_VERSION,
    plugins: {
      sudo: ecdsaValidator,
      regular: permissionValidator,
    },
    address: account.smartAccountAddress as Address,
  });

  // 6. Create bundler client + kernel client
  const bundlerUrl = getBundlerUrl(chainId);

  const pimlicoClient = createPimlicoClient({
    chain: config.chain,
    transport: http(bundlerUrl),
    entryPoint: ENTRY_POINT,
  });

  const kernelClient = createKernelAccountClient({
    account: kernelAccount,
    chain: config.chain,
    bundlerTransport: http(bundlerUrl),
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

  // 7. Submit UserOp — a no-op call triggers the plugin enable flow
  const userOpHash = await kernelClient.sendUserOperation({
    callData: await kernelAccount.encodeCalls([
      { to: zeroAddress, value: BigInt(0), data: "0x" },
    ]),
  });

  const receipt = await pimlicoClient.waitForUserOperationReceipt({
    hash: userOpHash,
    timeout: 120_000,
  });

  if (!receipt.success) {
    throw new Error("UserOperation failed on-chain");
  }

  const grantTxHash = receipt.receipt.transactionHash;

  // 8. Serialize the permission account for fast deserialization later
  const serialized = await serializePermissionAccount(kernelAccount, sessionKeyHex);
  const serializedEncrypted = encryptPrivateKey(serialized);
  await storeSerializedAccount(auth.userId, chainId, serializedEncrypted);

  // 9. Compute expiry date + update status with spend limits
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + expiryDays);

  // Update status, grant tx hash, and spend limits
  const { SmartAccount } = await import("@/lib/models/smart-account");
  await SmartAccount.findOneAndUpdate(
    { userId: account.userId, chainId },
    {
      $set: {
        sessionKeyStatus: "active",
        sessionKeyGrantTxHash: grantTxHash,
        sessionKeyExpiry: expiryDate,
        spendLimitPerTx: spendLimitPerTx,
        spendLimitDaily: spendLimitDaily,
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

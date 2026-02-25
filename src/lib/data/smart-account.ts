import { http, isAddress, parseUnits, parseAbi, encodeFunctionData, type Hex, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createKernelAccountClient, createZeroDevPaymasterClient } from "@zerodev/sdk";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { deserializePermissionAccount } from "@zerodev/permissions";
import {
  SmartAccount,
  parseSmartAccountAddressProjection,
  parseSmartAccountForSigning,
  serializeSmartAccount,
  serializeSmartAccounts,
  validateActivateSessionKeyInput,
  validateCreateSmartAccountRecordInput,
  validateEnsureSmartAccountInput,
  validateStoreSerializedAccountInput,
  validateUpdateSessionKeyStatusInput,
} from "@/lib/models/smart-account";
import { parseObjectId } from "@/lib/models/zod";
import { connectDB } from "@/lib/db";
import { getUsdcBalance, decryptPrivateKey } from "@/lib/hot-wallet";
import { computeSmartAccountAddress, createSessionKey } from "@/lib/smart-account";
import { ENTRY_POINT, KERNEL_VERSION } from "@/lib/smart-account-constants";
import { createChainPublicClient, getChainById, getDefaultChainConfig, getUsdcConfig, getZeroDevBundlerRpc } from "@/lib/chain-config";
import { createTransaction } from "@/lib/data/transactions";

/**
 * Get the user's smart account record for a specific chain (excludes sensitive fields).
 * Returns null if not found.
 */
export async function getSmartAccount(userId: string, chainId: number) {
  await connectDB();
  const userObjectId = parseObjectId(userId, "userId");
  const doc = await SmartAccount.findOne({
    userId: userObjectId,
    chainId,
  })
    .select("-sessionKeyEncrypted -serializedAccount")
    .lean();
  if (!doc) return null;
  return serializeSmartAccount(doc);
}

/**
 * Get the user's smart account INCLUDING sessionKeyEncrypted and serializedAccount (for signing).
 * Only use this when signing is needed — prefer getSmartAccount() otherwise.
 */
export async function getSmartAccountWithSessionKey(userId: string, chainId: number) {
  await connectDB();
  const userObjectId = parseObjectId(userId, "userId");
  const doc = await SmartAccount.findOne({
    userId: userObjectId,
    chainId,
  }).lean();
  if (!doc) return null;
  return serializeSmartAccount(doc);
}

/**
 * Get all smart accounts for a user across all chains (excludes sensitive fields).
 */
export async function getAllSmartAccounts(userId: string) {
  await connectDB();
  const userObjectId = parseObjectId(userId, "userId");
  const docs = await SmartAccount.find({
    userId: userObjectId,
  })
    .select("-sessionKeyEncrypted -serializedAccount")
    .lean();
  return serializeSmartAccounts(docs);
}

/**
 * Get the USDC balance of the user's smart account on a specific chain.
 * Returns null if no smart account exists on that chain.
 */
export async function getSmartAccountBalance(userId: string, chainId?: number) {
  await connectDB();
  const userObjectId = parseObjectId(userId, "userId");
  const resolvedChainId = chainId ?? getDefaultChainConfig().chain.id;
  const doc = await SmartAccount.findOne({
    userId: userObjectId,
    chainId: resolvedChainId,
  })
    .select("smartAccountAddress")
    .lean();
  if (!doc) return null;
  const parsed = parseSmartAccountAddressProjection(doc);
  const balance = await getUsdcBalance(parsed.smartAccountAddress, resolvedChainId);
  return { balance, address: parsed.smartAccountAddress };
}

/**
 * Create a new smart account record. Does not check for duplicates — use ensureSmartAccount for idempotent creation.
 */
export async function createSmartAccountRecord(data: {
  userId: string;
  ownerAddress: string;
  chainId: number;
  smartAccountAddress: string;
  sessionKeyAddress: string;
  sessionKeyEncrypted: string;
}) {
  await connectDB();
  const parsed = validateCreateSmartAccountRecordInput(data);
  const doc = await SmartAccount.create({
    userId: parseObjectId(parsed.userId, "userId"),
    ownerAddress: parsed.ownerAddress,
    chainId: parsed.chainId,
    smartAccountAddress: parsed.smartAccountAddress,
    sessionKeyAddress: parsed.sessionKeyAddress,
    sessionKeyEncrypted: parsed.sessionKeyEncrypted,
    sessionKeyStatus: "pending_grant",
  });
  return serializeSmartAccount(doc.toObject());
}

/**
 * Idempotent smart account creation: returns existing record if (userId, chainId) exists,
 * otherwise computes counterfactual address, generates session key, and creates a new record.
 */
export async function ensureSmartAccount(
  userId: string,
  ownerAddress: string,
  chainId: number,
) {
  await connectDB();
  const parsedInput = validateEnsureSmartAccountInput({
    userId,
    ownerAddress,
    chainId,
  });
  const userObjectId = parseObjectId(parsedInput.userId, "userId");

  const existing = await SmartAccount.findOne({
    userId: userObjectId,
    chainId: parsedInput.chainId,
  }).lean();
  if (existing) {
    return serializeSmartAccount(existing);
  }

  const smartAccountAddress = await computeSmartAccountAddress(
    parsedInput.ownerAddress as `0x${string}`,
    parsedInput.chainId,
  );
  const { address: sessionKeyAddress, encryptedPrivateKey: sessionKeyEncrypted } =
    createSessionKey();

  try {
    const doc = await SmartAccount.create({
      userId: userObjectId,
      ownerAddress: parsedInput.ownerAddress,
      chainId: parsedInput.chainId,
      smartAccountAddress,
      sessionKeyAddress,
      sessionKeyEncrypted,
      sessionKeyStatus: "pending_grant",
    });
    return serializeSmartAccount(doc.toObject());
  } catch (err: unknown) {
    // Handle race condition: a concurrent request may have created the record between
    // our findOne and create. Re-fetch and return the existing document.
    const isDuplicateKeyError =
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: number }).code === 11000;
    if (!isDuplicateKeyError) {
      throw err;
    }
    const existing = await SmartAccount.findOne({
      userId: userObjectId,
      chainId: parsedInput.chainId,
    }).lean();
    if (!existing) throw err; // Should not happen, but be safe
    return serializeSmartAccount(existing);
  }
}

/**
 * Store the encrypted serialized permission account (ZeroDev serializePermissionAccount output).
 * Returns the updated record or null if not found.
 */
export async function storeSerializedAccount(
  userId: string,
  chainId: number,
  serializedEncrypted: string,
) {
  await connectDB();
  const parsedInput = validateStoreSerializedAccountInput({
    userId,
    chainId,
    serializedEncrypted,
  });
  const doc = await SmartAccount.findOneAndUpdate(
    {
      userId: parseObjectId(parsedInput.userId, "userId"),
      chainId: parsedInput.chainId,
    },
    { $set: { serializedAccount: parsedInput.serializedEncrypted } },
    { returnDocument: "after", runValidators: true },
  ).lean();
  if (!doc) return null;
  return serializeSmartAccount(doc);
}

/**
 * Activate a session key: sets status to "active", stores grant tx hash,
 * expiry date, and spend limits. Used by finalizeSessionKey server action.
 * Returns the updated record or null if not found.
 */
export async function activateSessionKey(
  userId: string,
  chainId: number,
  grantTxHash: string,
  expiryDate: Date,
  spendLimitPerTx: number,
  spendLimitDaily: number,
) {
  await connectDB();
  const parsedInput = validateActivateSessionKeyInput({
    userId,
    chainId,
    grantTxHash,
    expiryDate,
    spendLimitPerTx,
    spendLimitDaily,
  });
  const doc = await SmartAccount.findOneAndUpdate(
    {
      userId: parseObjectId(parsedInput.userId, "userId"),
      chainId: parsedInput.chainId,
    },
    {
      $set: {
        sessionKeyStatus: "active",
        sessionKeyGrantTxHash: parsedInput.grantTxHash,
        sessionKeyExpiry: parsedInput.expiryDate,
        spendLimitPerTx: parsedInput.spendLimitPerTx,
        spendLimitDaily: parsedInput.spendLimitDaily,
      },
    },
    { returnDocument: "after", runValidators: true },
  ).lean();
  if (!doc) return null;
  return serializeSmartAccount(doc);
}

/**
 * Update session key status. Optionally stores the grant transaction hash.
 * Returns the updated record or null if not found.
 */
export async function updateSessionKeyStatus(
  userId: string,
  chainId: number,
  status: "pending_grant" | "active" | "expired" | "revoked",
  grantTxHash?: string,
) {
  await connectDB();
  const parsedInput = validateUpdateSessionKeyStatusInput({
    userId,
    chainId,
    status,
    grantTxHash,
  });
  const update: Record<string, unknown> = { sessionKeyStatus: parsedInput.status };
  if (parsedInput.grantTxHash !== undefined) {
    update.sessionKeyGrantTxHash = parsedInput.grantTxHash;
  }
  const doc = await SmartAccount.findOneAndUpdate(
    {
      userId: parseObjectId(parsedInput.userId, "userId"),
      chainId: parsedInput.chainId,
    },
    { $set: update },
    { returnDocument: "after", runValidators: true },
  ).lean();
  if (!doc) return null;
  return serializeSmartAccount(doc);
}

const USDC_TRANSFER_ABI = parseAbi([
  "function transfer(address to, uint256 amount) external returns (bool)",
]);

/**
 * Withdraw USDC from the user's smart account to a destination address.
 * Uses the session key to sign and submit a UserOp via ZeroDev bundler.
 */
export async function withdrawFromSmartAccount(
  userId: string,
  amount: number,
  toAddress: string,
  chainId?: number,
): Promise<{ txHash: string; userOpHash: string }> {
  if (!isAddress(toAddress)) {
    throw new Error("Invalid destination address");
  }
  if (amount <= 0) {
    throw new Error("Amount must be greater than 0");
  }

  const resolvedChainId = chainId ?? getDefaultChainConfig().chain.id;
  const config = getChainById(resolvedChainId);
  if (!config) {
    throw new Error(`Unsupported chain: ${resolvedChainId}`);
  }
  const usdcToken = getUsdcConfig(resolvedChainId);
  const decimals = usdcToken?.decimals ?? 6;

  await connectDB();
  const userObjectId = parseObjectId(userId, "userId");

  // Look up smart account with session key and serialized account
  const rawAccount = await SmartAccount.findOne({
    userId: userObjectId,
    chainId: resolvedChainId,
  }).lean();
  if (!rawAccount) {
    throw new Error("No smart account found for this user");
  }
  const account = parseSmartAccountForSigning(rawAccount);

  // Validate session key is active and not expired
  if (account.sessionKeyStatus !== "active") {
    throw new Error(
      `Session key is not active — current status: ${account.sessionKeyStatus}`,
    );
  }
  if (account.sessionKeyExpiry < new Date()) {
    throw new Error("Session key has expired");
  }
  if (!account.serializedAccount) {
    throw new Error("No serialized account found — session key may not have been fully authorized");
  }

  // Check USDC balance
  const balance = await getUsdcBalance(account.smartAccountAddress, resolvedChainId);
  if (parseFloat(balance) < amount) {
    throw new Error(
      `Insufficient balance: ${balance} USDC available, ${amount} requested`,
    );
  }

  // Decrypt session key and serialized account
  const sessionKeyHex = decryptPrivateKey(account.sessionKeyEncrypted) as Hex;
  const serializedAccount = decryptPrivateKey(account.serializedAccount);

  // Build kernel account from serialized permission account
  const publicClient = createChainPublicClient(resolvedChainId);

  const sessionKeyAccount = privateKeyToAccount(sessionKeyHex);
  const ecdsaSigner = await toECDSASigner({
    signer: sessionKeyAccount,
  });

  const kernelAccount = await deserializePermissionAccount(
    publicClient,
    ENTRY_POINT,
    KERNEL_VERSION,
    serializedAccount,
    ecdsaSigner,
  );

  // Build ZeroDev bundler and paymaster transports (unified v3 endpoint)
  const zerodevRpcUrl = getZeroDevBundlerRpc(resolvedChainId);
  const bundlerTransport = http(zerodevRpcUrl);

  const paymasterClient = createZeroDevPaymasterClient({
    chain: config.chain,
    transport: http(zerodevRpcUrl),
  });

  const kernelClient = createKernelAccountClient({
    account: kernelAccount,
    chain: config.chain,
    bundlerTransport,
    client: publicClient,
    paymaster: paymasterClient,
  });

  // Encode USDC transfer calldata
  const calldata = encodeFunctionData({
    abi: USDC_TRANSFER_ABI,
    functionName: "transfer",
    args: [toAddress as Address, parseUnits(String(amount), decimals)],
  });

  // Submit UserOp
  const userOpHash = await kernelClient.sendUserOperation({
    callData: await kernelAccount.encodeCalls([
      { to: config.usdcAddress, value: BigInt(0), data: calldata },
    ]),
  });

  // Wait for receipt
  const receipt = await kernelClient.waitForUserOperationReceipt({
    hash: userOpHash,
    timeout: 120_000,
  });

  if (!receipt.success) {
    throw new Error("UserOperation failed on-chain");
  }

  const txHash = receipt.receipt.transactionHash;

  // Log withdrawal transaction
  await createTransaction({
    amount,
    endpoint: `withdrawal:${toAddress}`,
    txHash,
    network: config.networkString,
    chainId: resolvedChainId,
    status: "completed",
    type: "withdrawal",
    userId,
  });

  return { txHash, userOpHash };
}

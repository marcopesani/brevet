import { Types } from "mongoose";
import { http, isAddress, parseUnits, parseAbi, encodeFunctionData, type Hex, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createKernelAccountClient, createZeroDevPaymasterClient } from "@zerodev/sdk";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { deserializePermissionAccount } from "@zerodev/permissions";
import { SmartAccount, SmartAccountDTO, SmartAccountWithKeyDTO } from "@/lib/models/smart-account";
import { connectDB } from "@/lib/db";
import { getUsdcBalance, decryptPrivateKey } from "@/lib/encryption";
import { computeSmartAccountAddress, createSessionKey } from "@/lib/smart-account";
import { ENTRY_POINT, KERNEL_VERSION } from "@/lib/smart-account-constants";
import { createChainPublicClient, getChainById, getUsdcConfig, getZeroDevBundlerRpc } from "@/lib/chain-config";
import { createTransaction } from "@/lib/data/transactions";

/**
 * Get the user's smart account record for a specific chain (excludes sensitive fields).
 * Returns null if not found.
 */
export async function getSmartAccount(userId: string, chainId: number): Promise<SmartAccountDTO | null> {
  await connectDB();
  const doc = await SmartAccount.findOne({
    userId: new Types.ObjectId(userId),
    chainId,
  })
    .select("-sessionKeyEncrypted -serializedAccount")
    .lean();
  if (!doc) return null;
  return SmartAccountDTO.parse(doc);
}

/**
 * Get the user's smart account INCLUDING sessionKeyEncrypted and serializedAccount (for signing).
 * Only use this when signing is needed — prefer getSmartAccount() otherwise.
 */
export async function getSmartAccountWithSessionKey(userId: string, chainId: number): Promise<SmartAccountWithKeyDTO | null> {
  await connectDB();
  const doc = await SmartAccount.findOne({
    userId: new Types.ObjectId(userId),
    chainId,
  }).lean();
  if (!doc) return null;
  return SmartAccountWithKeyDTO.parse(doc);
}

/**
 * Get all smart accounts for a user across all chains (excludes sensitive fields).
 */
export async function getAllSmartAccounts(userId: string): Promise<SmartAccountDTO[]> {
  await connectDB();
  const docs = await SmartAccount.find({
    userId: new Types.ObjectId(userId),
  })
    .select("-sessionKeyEncrypted -serializedAccount")
    .lean();
  return docs.map((doc) => SmartAccountDTO.parse(doc));
}

/**
 * Get the USDC balance of the user's smart account on a specific chain.
 * Returns null if no smart account exists on that chain.
 */
export async function getSmartAccountBalance(userId: string, chainId: number): Promise<{ balance: string; address: string } | null> {
  await connectDB();
  const doc = await SmartAccount.findOne({
    userId: new Types.ObjectId(userId),
    chainId,
  })
    .select("smartAccountAddress")
    .lean();
  if (!doc) return null;
  const balance = await getUsdcBalance(doc.smartAccountAddress, chainId);
  return { balance, address: doc.smartAccountAddress };
}

/**
 * Idempotent smart account creation: returns existing record if (userId, chainId) exists,
 * otherwise computes counterfactual address, generates session key, and creates a new record.
 */
export async function ensureSmartAccount(
  userId: string,
  ownerAddress: string,
  chainId: number,
): Promise<SmartAccountWithKeyDTO> {
  await connectDB();
  const userObjectId = new Types.ObjectId(userId);

  const existing = await SmartAccount.findOne({
    userId: userObjectId,
    chainId,
  }).lean();
  if (existing) {
    return SmartAccountWithKeyDTO.parse(existing);
  }

  const smartAccountAddress = await computeSmartAccountAddress(
    ownerAddress as `0x${string}`,
    chainId,
  );
  const { address: sessionKeyAddress, encryptedPrivateKey: sessionKeyEncrypted } =
    createSessionKey();

  try {
    const doc = await SmartAccount.create({
      userId: userObjectId,
      ownerAddress,
      chainId,
      smartAccountAddress,
      sessionKeyAddress,
      sessionKeyEncrypted,
      sessionKeyStatus: "pending_grant",
    });
    return SmartAccountWithKeyDTO.parse(doc.toObject());
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
    const existingDoc = await SmartAccount.findOne({
      userId: userObjectId,
      chainId,
    }).lean();
    if (!existingDoc) throw err; // Should not happen, but be safe
    return SmartAccountWithKeyDTO.parse(existingDoc);
  }
}

/**
 * Store the encrypted serialized permission account (ZeroDev serializePermissionAccount output).
 */
export async function storeSerializedAccount(
  userId: string,
  chainId: number,
  serializedEncrypted: string,
): Promise<void> {
  await connectDB();
  await SmartAccount.findOneAndUpdate(
    { userId: new Types.ObjectId(userId), chainId },
    { $set: { serializedAccount: serializedEncrypted } },
  );
}

/**
 * Activate a session key: sets status to "active", stores grant tx hash,
 * expiry date, and spend limits. Used by finalizeSessionKey server action.
 */
export async function activateSessionKey(
  userId: string,
  chainId: number,
  grantTxHash: string,
  expiryDate: Date,
  spendLimitPerTx: number,
  spendLimitDaily: number,
): Promise<void> {
  await connectDB();
  await SmartAccount.findOneAndUpdate(
    { userId: new Types.ObjectId(userId), chainId },
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
}

/**
 * Update session key status. Optionally stores the grant transaction hash.
 */
export async function updateSessionKeyStatus(
  userId: string,
  chainId: number,
  status: "pending_grant" | "active" | "expired" | "revoked",
  grantTxHash?: string,
): Promise<void> {
  await connectDB();
  const update: Record<string, unknown> = { sessionKeyStatus: status };
  if (grantTxHash !== undefined) {
    update.sessionKeyGrantTxHash = grantTxHash;
  }
  await SmartAccount.findOneAndUpdate(
    { userId: new Types.ObjectId(userId), chainId },
    { $set: update },
  );
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
  chainId: number,
): Promise<{ txHash: string; userOpHash: string }> {
  if (!isAddress(toAddress)) {
    throw new Error("Invalid destination address");
  }
  if (amount <= 0) {
    throw new Error("Amount must be greater than 0");
  }

  const config = getChainById(chainId);
  if (!config) {
    throw new Error(`Unsupported chain: ${chainId}`);
  }
  const usdcToken = getUsdcConfig(chainId);
  const decimals = usdcToken?.decimals ?? 6;

  await connectDB();

  // Look up smart account with session key and serialized account
  const account = await SmartAccount.findOne({
    userId: new Types.ObjectId(userId),
    chainId,
  }).lean();
  if (!account) {
    throw new Error("No smart account found for this user");
  }

  // Validate session key is active and not expired
  if (account.sessionKeyStatus !== "active") {
    throw new Error(
      `Session key is not active — current status: ${account.sessionKeyStatus}`,
    );
  }
  if (!account.sessionKeyExpiry || account.sessionKeyExpiry < new Date()) {
    throw new Error("Session key has expired");
  }
  if (!account.serializedAccount) {
    throw new Error("No serialized account found — session key may not have been fully authorized");
  }

  // Check USDC balance
  const balance = await getUsdcBalance(account.smartAccountAddress, chainId);
  if (parseFloat(balance) < amount) {
    throw new Error(
      `Insufficient balance: ${balance} USDC available, ${amount} requested`,
    );
  }

  // Decrypt session key and serialized account
  const sessionKeyHex = decryptPrivateKey(account.sessionKeyEncrypted) as Hex;
  const serializedAccount = decryptPrivateKey(account.serializedAccount);

  // Build kernel account from serialized permission account
  const publicClient = createChainPublicClient(chainId);

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
  const zerodevRpcUrl = getZeroDevBundlerRpc(chainId);
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
    chainId,
    status: "completed",
    type: "withdrawal",
    userId,
  });

  return { txHash, userOpHash };
}

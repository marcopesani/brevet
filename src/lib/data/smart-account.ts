import { Types } from "mongoose";
import { SmartAccount } from "@/lib/models/smart-account";
import { connectDB } from "@/lib/db";
import { getUsdcBalance } from "@/lib/hot-wallet";
import { computeSmartAccountAddress, createSessionKey } from "@/lib/smart-account";

const DEFAULT_CHAIN_ID = parseInt(
  process.env.NEXT_PUBLIC_CHAIN_ID || "8453",
  10,
);

/** Serialize a lean SmartAccount doc for the Server→Client boundary. */
function serialize<T extends { _id: Types.ObjectId; userId: Types.ObjectId; createdAt?: Date; updatedAt?: Date; sessionKeyExpiry?: Date }>(
  doc: T,
) {
  const { _id, userId, createdAt, updatedAt, sessionKeyExpiry, ...rest } = doc;
  return {
    ...rest,
    id: _id.toString(),
    userId: userId.toString(),
    ...(createdAt !== undefined && { createdAt: createdAt instanceof Date ? createdAt.toISOString() : createdAt }),
    ...(updatedAt !== undefined && { updatedAt: updatedAt instanceof Date ? updatedAt.toISOString() : updatedAt }),
    ...(sessionKeyExpiry !== undefined && { sessionKeyExpiry: sessionKeyExpiry instanceof Date ? sessionKeyExpiry.toISOString() : sessionKeyExpiry }),
  };
}

/**
 * Get the user's smart account record for a specific chain (excludes sensitive fields).
 * Returns null if not found.
 */
export async function getSmartAccount(userId: string, chainId: number) {
  await connectDB();
  const doc = await SmartAccount.findOne({
    userId: new Types.ObjectId(userId),
    chainId,
  })
    .select("-sessionKeyEncrypted -serializedAccount")
    .lean();
  if (!doc) return null;
  return serialize(doc);
}

/**
 * Get the user's smart account INCLUDING sessionKeyEncrypted and serializedAccount (for signing).
 * Only use this when signing is needed — prefer getSmartAccount() otherwise.
 */
export async function getSmartAccountWithSessionKey(userId: string, chainId: number) {
  await connectDB();
  const doc = await SmartAccount.findOne({
    userId: new Types.ObjectId(userId),
    chainId,
  }).lean();
  if (!doc) return null;
  return serialize(doc);
}

/**
 * Get all smart accounts for a user across all chains (excludes sensitive fields).
 */
export async function getAllSmartAccounts(userId: string) {
  await connectDB();
  const docs = await SmartAccount.find({
    userId: new Types.ObjectId(userId),
  })
    .select("-sessionKeyEncrypted -serializedAccount")
    .lean();
  return docs.map(serialize);
}

/**
 * Get the USDC balance of the user's smart account on a specific chain.
 * Returns null if no smart account exists on that chain.
 */
export async function getSmartAccountBalance(userId: string, chainId?: number) {
  await connectDB();
  const resolvedChainId = chainId ?? DEFAULT_CHAIN_ID;
  const doc = await SmartAccount.findOne({
    userId: new Types.ObjectId(userId),
    chainId: resolvedChainId,
  })
    .select("smartAccountAddress")
    .lean();
  if (!doc) return null;
  const balance = await getUsdcBalance(doc.smartAccountAddress, resolvedChainId);
  return { balance, address: doc.smartAccountAddress };
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
  const doc = await SmartAccount.create({
    userId: new Types.ObjectId(data.userId),
    ownerAddress: data.ownerAddress,
    chainId: data.chainId,
    smartAccountAddress: data.smartAccountAddress,
    sessionKeyAddress: data.sessionKeyAddress,
    sessionKeyEncrypted: data.sessionKeyEncrypted,
    sessionKeyStatus: "pending_grant",
  });
  const lean = doc.toObject();
  return serialize(lean);
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
  const userObjectId = new Types.ObjectId(userId);

  const existing = await SmartAccount.findOne({
    userId: userObjectId,
    chainId,
  }).lean();
  if (existing) {
    return serialize(existing);
  }

  const smartAccountAddress = await computeSmartAccountAddress(
    ownerAddress as `0x${string}`,
    chainId,
  );
  const { address: sessionKeyAddress, encryptedPrivateKey: sessionKeyEncrypted } =
    createSessionKey();

  const doc = await SmartAccount.create({
    userId: userObjectId,
    ownerAddress,
    chainId,
    smartAccountAddress,
    sessionKeyAddress,
    sessionKeyEncrypted,
    sessionKeyStatus: "pending_grant",
  });
  const lean = doc.toObject();
  return serialize(lean);
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
  const doc = await SmartAccount.findOneAndUpdate(
    { userId: new Types.ObjectId(userId), chainId },
    { $set: { serializedAccount: serializedEncrypted } },
    { returnDocument: "after" },
  ).lean();
  if (!doc) return null;
  return serialize(doc);
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
  const update: Record<string, unknown> = { sessionKeyStatus: status };
  if (grantTxHash !== undefined) {
    update.sessionKeyGrantTxHash = grantTxHash;
  }
  const doc = await SmartAccount.findOneAndUpdate(
    { userId: new Types.ObjectId(userId), chainId },
    { $set: update },
    { returnDocument: "after" },
  ).lean();
  if (!doc) return null;
  return serialize(doc);
}

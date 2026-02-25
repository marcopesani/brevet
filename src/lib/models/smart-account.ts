import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { z } from "zod/v4";
import {
  objectIdSchema,
  objectIdStringSchema,
  parseIsoDate,
  parseObjectId,
  stringifyObjectId,
} from "@/lib/models/zod";

const defaultChainId = parseInt(
  process.env.NEXT_PUBLIC_CHAIN_ID || "8453",
  10,
);

export interface ISmartAccount {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  chainId: number;

  // Smart account (on-chain)
  ownerAddress: string;
  smartAccountAddress: string;
  smartAccountVersion: string;

  // Session key (server-side)
  sessionKeyAddress: string;
  sessionKeyEncrypted: string;
  serializedAccount?: string;
  sessionKeyStatus:
    | "pending_grant"
    | "active"
    | "expired"
    | "revoked";
  sessionKeyGrantTxHash?: string;
  sessionKeyExpiry?: Date;
  spendLimitPerTx?: number;
  spendLimitDaily?: number;

  createdAt: Date;
  updatedAt: Date;
}

export interface ISmartAccountDocument
  extends Omit<ISmartAccount, "_id">,
    Document {}

export const smartAccountSessionStatusSchema = z.enum([
  "pending_grant",
  "active",
  "expired",
  "revoked",
]);

const smartAccountReadSchema = z.object({
  _id: objectIdSchema,
  userId: objectIdSchema,
  chainId: z.number().int(),
  ownerAddress: z.string().min(1),
  smartAccountAddress: z.string().min(1),
  smartAccountVersion: z.string().min(1),
  sessionKeyAddress: z.string().min(1),
  sessionKeyEncrypted: z.string().min(1).optional(),
  serializedAccount: z.string().optional(),
  sessionKeyStatus: smartAccountSessionStatusSchema,
  sessionKeyGrantTxHash: z.string().optional(),
  sessionKeyExpiry: z.date().optional(),
  spendLimitPerTx: z.number().optional(),
  spendLimitDaily: z.number().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

const smartAccountSerializedSchema = smartAccountReadSchema.transform(
  ({
    _id,
    userId,
    createdAt,
    updatedAt,
    sessionKeyExpiry,
    ...rest
  }) => ({
    ...rest,
    id: stringifyObjectId(_id, "smartAccount._id"),
    userId: stringifyObjectId(userId, "smartAccount.userId"),
    ...(createdAt !== undefined && { createdAt: parseIsoDate(createdAt) }),
    ...(updatedAt !== undefined && { updatedAt: parseIsoDate(updatedAt) }),
    ...(sessionKeyExpiry !== undefined && {
      sessionKeyExpiry: parseIsoDate(sessionKeyExpiry),
    }),
  }),
);

export type SmartAccountSerialized = z.output<typeof smartAccountSerializedSchema>;

export const ensureSmartAccountInputSchema = z.object({
  userId: objectIdStringSchema,
  ownerAddress: z.string().min(1),
  chainId: z.number().int().positive(),
});

export type EnsureSmartAccountInput = z.infer<
  typeof ensureSmartAccountInputSchema
>;

export const createSmartAccountRecordInputSchema = z.object({
  userId: objectIdStringSchema,
  ownerAddress: z.string().min(1),
  chainId: z.number().int().positive(),
  smartAccountAddress: z.string().min(1),
  sessionKeyAddress: z.string().min(1),
  sessionKeyEncrypted: z.string().min(1),
});

export type CreateSmartAccountRecordInput = z.infer<
  typeof createSmartAccountRecordInputSchema
>;

export const storeSerializedAccountInputSchema = z.object({
  userId: objectIdStringSchema,
  chainId: z.number().int().positive(),
  serializedEncrypted: z.string().min(1),
});

export type StoreSerializedAccountInput = z.infer<
  typeof storeSerializedAccountInputSchema
>;

export const activateSessionKeyInputSchema = z.object({
  userId: objectIdStringSchema,
  chainId: z.number().int().positive(),
  grantTxHash: z.string().min(1),
  expiryDate: z.date(),
  spendLimitPerTx: z.number().int().positive(),
  spendLimitDaily: z.number().int().positive(),
});

export type ActivateSessionKeyInput = z.infer<
  typeof activateSessionKeyInputSchema
>;

export const updateSessionKeyStatusInputSchema = z.object({
  userId: objectIdStringSchema,
  chainId: z.number().int().positive(),
  status: smartAccountSessionStatusSchema,
  grantTxHash: z.string().min(1).optional(),
});

export type UpdateSessionKeyStatusInput = z.infer<
  typeof updateSessionKeyStatusInputSchema
>;

const smartAccountAddressProjectionSchema = z.object({
  smartAccountAddress: z.string().min(1),
});

export type SmartAccountAddressProjection = z.infer<
  typeof smartAccountAddressProjectionSchema
>;

const smartAccountForSigningSchema = smartAccountReadSchema.extend({
  sessionKeyEncrypted: z.string().min(1),
  serializedAccount: z.string().optional(),
  sessionKeyExpiry: z.date(),
});

export type SmartAccountForSigning = z.infer<
  typeof smartAccountForSigningSchema
>;

export function serializeSmartAccount(doc: unknown): SmartAccountSerialized {
  const parsed = smartAccountReadSchema.parse(doc);
  return smartAccountSerializedSchema.parse(parsed);
}

export function serializeSmartAccounts(
  docs: unknown[],
): SmartAccountSerialized[] {
  return docs.map((doc) => serializeSmartAccount(doc));
}

export function validateEnsureSmartAccountInput(
  input: unknown,
): EnsureSmartAccountInput {
  return ensureSmartAccountInputSchema.parse(input);
}

export function validateCreateSmartAccountRecordInput(
  input: unknown,
): CreateSmartAccountRecordInput {
  return createSmartAccountRecordInputSchema.parse(input);
}

export function validateStoreSerializedAccountInput(
  input: unknown,
): StoreSerializedAccountInput {
  return storeSerializedAccountInputSchema.parse(input);
}

export function validateActivateSessionKeyInput(
  input: unknown,
): ActivateSessionKeyInput {
  return activateSessionKeyInputSchema.parse(input);
}

export function validateUpdateSessionKeyStatusInput(
  input: unknown,
): UpdateSessionKeyStatusInput {
  return updateSessionKeyStatusInputSchema.parse(input);
}

export function parseSmartAccountId(accountId: string): Types.ObjectId {
  return parseObjectId(accountId, "smartAccountId");
}

export function parseSmartAccountAddressProjection(
  doc: unknown,
): SmartAccountAddressProjection {
  return smartAccountAddressProjectionSchema.parse(doc);
}

export function parseSmartAccountForSigning(doc: unknown): SmartAccountForSigning {
  return smartAccountForSigningSchema.parse(doc);
}

const smartAccountSchema = new Schema<ISmartAccountDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    chainId: { type: Number, required: true, default: defaultChainId },

    // Smart account (on-chain)
    ownerAddress: { type: String, required: true },
    smartAccountAddress: { type: String, required: true },
    smartAccountVersion: { type: String, required: true, default: "0.3.3" },

    // Session key (server-side)
    sessionKeyAddress: { type: String, required: true },
    sessionKeyEncrypted: { type: String, required: true },
    serializedAccount: { type: String },
    sessionKeyStatus: {
      type: String,
      required: true,
      enum: ["pending_grant", "active", "expired", "revoked"],
      default: "pending_grant",
    },
    sessionKeyGrantTxHash: { type: String },
    sessionKeyExpiry: { type: Date },
    spendLimitPerTx: { type: Number },
    spendLimitDaily: { type: Number },
  },
  {
    timestamps: true,
    collection: "smartaccounts",
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

smartAccountSchema.virtual("id").get(function () {
  return this._id.toString();
});

smartAccountSchema.index({ userId: 1, chainId: 1 }, { unique: true });

export const SmartAccount: Model<ISmartAccountDocument> =
  mongoose.models.SmartAccount ||
  mongoose.model<ISmartAccountDocument>("SmartAccount", smartAccountSchema);

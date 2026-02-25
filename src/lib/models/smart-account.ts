import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { z } from "zod/v4";
import {
  dateLikeSchema,
  nullableDateLikeSchema,
  objectIdLikeSchema,
  objectIdStringSchema,
  toObjectId,
} from "@/lib/models/zod-utils";

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

export interface SmartAccountSerialized {
  id: string;
  userId: string;
  chainId: number;
  ownerAddress: string;
  smartAccountAddress: string;
  smartAccountVersion: string;
  sessionKeyAddress: string;
  sessionKeyStatus: "pending_grant" | "active" | "expired" | "revoked";
  sessionKeyGrantTxHash?: string;
  sessionKeyExpiry?: string;
  spendLimitPerTx?: number;
  spendLimitDaily?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SmartAccountSerializedWithSecrets
  extends SmartAccountSerialized {
  sessionKeyEncrypted: string;
  serializedAccount?: string;
}

const sessionKeyStatusSchema = z.enum([
  "pending_grant",
  "active",
  "expired",
  "revoked",
]);

const smartAccountReadSchema = z.object({
  _id: objectIdLikeSchema,
  userId: objectIdLikeSchema,
  chainId: z.number().int(),
  ownerAddress: z.string().min(1),
  smartAccountAddress: z.string().min(1),
  smartAccountVersion: z.string().min(1),
  sessionKeyAddress: z.string().min(1),
  sessionKeyEncrypted: z.string().min(1),
  serializedAccount: z.string().optional(),
  sessionKeyStatus: sessionKeyStatusSchema,
  sessionKeyGrantTxHash: z.string().optional(),
  sessionKeyExpiry: nullableDateLikeSchema.optional(),
  spendLimitPerTx: z.number().optional(),
  spendLimitDaily: z.number().optional(),
  createdAt: dateLikeSchema,
  updatedAt: dateLikeSchema,
});

const smartAccountPublicSchema = z.object({
  id: z.string(),
  userId: z.string(),
  chainId: z.number().int(),
  ownerAddress: z.string().min(1),
  smartAccountAddress: z.string().min(1),
  smartAccountVersion: z.string().min(1),
  sessionKeyAddress: z.string().min(1),
  sessionKeyStatus: sessionKeyStatusSchema,
  sessionKeyGrantTxHash: z.string().optional(),
  sessionKeyExpiry: z.string().optional(),
  spendLimitPerTx: z.number().optional(),
  spendLimitDaily: z.number().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const smartAccountWithSecretsSchema = smartAccountPublicSchema.extend({
  sessionKeyEncrypted: z.string().min(1),
  serializedAccount: z.string().optional(),
});

const smartAccountCreateInputSchema = z
  .object({
    userId: objectIdStringSchema,
    chainId: z.number().int().positive().optional(),
    ownerAddress: z.string().min(1),
    smartAccountAddress: z.string().min(1),
    smartAccountVersion: z.string().min(1).optional(),
    sessionKeyAddress: z.string().min(1),
    sessionKeyEncrypted: z.string().min(1),
    serializedAccount: z.string().optional(),
    sessionKeyStatus: sessionKeyStatusSchema.optional(),
    sessionKeyGrantTxHash: z.string().optional(),
    sessionKeyExpiry: dateLikeSchema.optional(),
    spendLimitPerTx: z.number().positive().optional(),
    spendLimitDaily: z.number().positive().optional(),
  })
  .transform((data) => ({
    userId: toObjectId(data.userId, "userId"),
    ...(data.chainId !== undefined && { chainId: data.chainId }),
    ownerAddress: data.ownerAddress,
    smartAccountAddress: data.smartAccountAddress,
    ...(data.smartAccountVersion !== undefined && {
      smartAccountVersion: data.smartAccountVersion,
    }),
    sessionKeyAddress: data.sessionKeyAddress,
    sessionKeyEncrypted: data.sessionKeyEncrypted,
    ...(data.serializedAccount !== undefined && {
      serializedAccount: data.serializedAccount,
    }),
    ...(data.sessionKeyStatus !== undefined && {
      sessionKeyStatus: data.sessionKeyStatus,
    }),
    ...(data.sessionKeyGrantTxHash !== undefined && {
      sessionKeyGrantTxHash: data.sessionKeyGrantTxHash,
    }),
    ...(data.sessionKeyExpiry !== undefined && {
      sessionKeyExpiry: data.sessionKeyExpiry,
    }),
    ...(data.spendLimitPerTx !== undefined && {
      spendLimitPerTx: data.spendLimitPerTx,
    }),
    ...(data.spendLimitDaily !== undefined && {
      spendLimitDaily: data.spendLimitDaily,
    }),
  }));

const smartAccountActivateInputSchema = z.object({
  grantTxHash: z.string().min(1),
  expiryDate: dateLikeSchema,
  spendLimitPerTx: z.number().positive(),
  spendLimitDaily: z.number().positive(),
});

const smartAccountStatusUpdateSchema = z.object({
  status: sessionKeyStatusSchema,
  grantTxHash: z.string().optional(),
});

const smartAccountSerializedAccountSchema = z.object({
  serializedEncrypted: z.string().min(1),
});

export type SmartAccountCreateDocumentInput = z.output<
  typeof smartAccountCreateInputSchema
>;

/** Validate and normalize create input for SmartAccount.create(). */
export function validateSmartAccountCreateInput(
  input: unknown,
): SmartAccountCreateDocumentInput {
  return smartAccountCreateInputSchema.parse(input);
}

/** Validate activate-session-key update payload. */
export function validateSmartAccountActivateInput(input: unknown): z.output<
  typeof smartAccountActivateInputSchema
> {
  return smartAccountActivateInputSchema.parse(input);
}

/** Validate session-key-status update payload. */
export function validateSmartAccountStatusUpdateInput(input: unknown): z.output<
  typeof smartAccountStatusUpdateSchema
> {
  return smartAccountStatusUpdateSchema.parse(input);
}

/** Validate serialized-account storage payload. */
export function validateSmartAccountSerializedAccountInput(
  input: unknown,
): z.output<typeof smartAccountSerializedAccountSchema> {
  return smartAccountSerializedAccountSchema.parse(input);
}

/** Serialize and validate a smart account document for public app-layer usage. */
export function serializeSmartAccount(input: unknown): SmartAccountSerialized {
  const parsed = smartAccountReadSchema.parse(input);
  return smartAccountPublicSchema.parse({
    id: parsed._id,
    userId: parsed.userId,
    chainId: parsed.chainId,
    ownerAddress: parsed.ownerAddress,
    smartAccountAddress: parsed.smartAccountAddress,
    smartAccountVersion: parsed.smartAccountVersion,
    sessionKeyAddress: parsed.sessionKeyAddress,
    sessionKeyStatus: parsed.sessionKeyStatus,
    ...(parsed.sessionKeyGrantTxHash !== undefined && {
      sessionKeyGrantTxHash: parsed.sessionKeyGrantTxHash,
    }),
    ...(parsed.sessionKeyExpiry != null && {
      sessionKeyExpiry: parsed.sessionKeyExpiry.toISOString(),
    }),
    ...(parsed.spendLimitPerTx !== undefined && {
      spendLimitPerTx: parsed.spendLimitPerTx,
    }),
    ...(parsed.spendLimitDaily !== undefined && {
      spendLimitDaily: parsed.spendLimitDaily,
    }),
    createdAt: parsed.createdAt.toISOString(),
    updatedAt: parsed.updatedAt.toISOString(),
  });
}

/**
 * Serialize and validate a smart account document including secret key material.
 * Use only on trusted server-side paths that require signing.
 */
export function serializeSmartAccountWithSecrets(
  input: unknown,
): SmartAccountSerializedWithSecrets {
  const parsed = smartAccountReadSchema.parse(input);
  return smartAccountWithSecretsSchema.parse({
    ...serializeSmartAccount(parsed),
    sessionKeyEncrypted: parsed.sessionKeyEncrypted,
    ...(parsed.serializedAccount !== undefined && {
      serializedAccount: parsed.serializedAccount,
    }),
  });
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

smartAccountSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret) => serializeSmartAccount(ret),
});

smartAccountSchema.set("toObject", {
  virtuals: true,
  transform: (_doc, ret) => serializeSmartAccount(ret),
});

export const SmartAccount: Model<ISmartAccountDocument> =
  mongoose.models.SmartAccount ||
  mongoose.model<ISmartAccountDocument>("SmartAccount", smartAccountSchema);

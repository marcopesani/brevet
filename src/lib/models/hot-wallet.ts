import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { z } from "zod/v4";
import {
  dateLikeSchema,
  objectIdLikeSchema,
  objectIdStringSchema,
  toObjectId,
} from "@/lib/models/zod-utils";

const DEFAULT_CHAIN_ID = parseInt(
  process.env.NEXT_PUBLIC_CHAIN_ID || "8453",
  10,
);

export interface IHotWallet {
  _id: Types.ObjectId;
  address: string;
  encryptedPrivateKey: string;
  userId: Types.ObjectId;
  chainId: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IHotWalletDocument extends Omit<IHotWallet, "_id">, Document {}

export interface HotWalletSerialized {
  id: string;
  address: string;
  userId: string;
  chainId: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface HotWalletSerializedWithKey extends HotWalletSerialized {
  encryptedPrivateKey: string;
}

const hotWalletReadSchema = z.object({
  _id: objectIdLikeSchema,
  address: z.string().min(1),
  encryptedPrivateKey: z.string().min(1),
  userId: objectIdLikeSchema,
  chainId: z.number().int(),
  createdAt: dateLikeSchema,
  updatedAt: dateLikeSchema,
});

const hotWalletPublicSchema = z.object({
  id: z.string(),
  address: z.string().min(1),
  userId: z.string(),
  chainId: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const hotWalletWithKeySchema = hotWalletPublicSchema.extend({
  encryptedPrivateKey: z.string().min(1),
});

const hotWalletCreateInputSchema = z
  .object({
    address: z.string().min(1),
    encryptedPrivateKey: z.string().min(1),
    userId: objectIdStringSchema,
    chainId: z.number().int().positive().optional(),
  })
  .transform((data) => ({
    address: data.address,
    encryptedPrivateKey: data.encryptedPrivateKey,
    userId: toObjectId(data.userId, "userId"),
    ...(data.chainId !== undefined && { chainId: data.chainId }),
  }));

export type HotWalletCreateDocumentInput = z.output<
  typeof hotWalletCreateInputSchema
>;

/** Validate and normalize create input for HotWallet.create(). */
export function validateHotWalletCreateInput(
  input: unknown,
): HotWalletCreateDocumentInput {
  return hotWalletCreateInputSchema.parse(input);
}

/** Serialize and validate a hot wallet document for public app-layer usage. */
export function serializeHotWallet(input: unknown): HotWalletSerialized {
  const parsed = hotWalletReadSchema.parse(input);
  return hotWalletPublicSchema.parse({
    id: parsed._id,
    address: parsed.address,
    userId: parsed.userId,
    chainId: parsed.chainId,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
  });
}

/**
 * Serialize and validate a hot wallet document including encrypted key material.
 * Use only on trusted server-side paths that require signing.
 */
export function serializeHotWalletWithKey(
  input: unknown,
): HotWalletSerializedWithKey {
  const parsed = hotWalletReadSchema.parse(input);
  return hotWalletWithKeySchema.parse({
    id: parsed._id,
    address: parsed.address,
    encryptedPrivateKey: parsed.encryptedPrivateKey,
    userId: parsed.userId,
    chainId: parsed.chainId,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
  });
}

const hotWalletSchema = new Schema<IHotWalletDocument>(
  {
    address: { type: String, required: true },
    encryptedPrivateKey: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    chainId: { type: Number, required: true, default: DEFAULT_CHAIN_ID },
  },
  {
    timestamps: true,
    collection: "hotwallets",
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

hotWalletSchema.index({ userId: 1, chainId: 1 }, { unique: true });

hotWalletSchema.virtual("id").get(function () {
  return this._id.toString();
});

hotWalletSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret) => serializeHotWallet(ret),
});

hotWalletSchema.set("toObject", {
  virtuals: true,
  transform: (_doc, ret) => serializeHotWallet(ret),
});

export const HotWallet: Model<IHotWalletDocument> =
  mongoose.models.HotWallet ||
  mongoose.model<IHotWalletDocument>("HotWallet", hotWalletSchema);

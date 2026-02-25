import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { z } from "zod/v4";
import { objectIdSchema, objectIdStringSchema, parseObjectId, stringifyObjectId } from "@/lib/models/zod";

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

const hotWalletReadSchema = z.object({
  _id: objectIdSchema,
  address: z.string().min(1),
  encryptedPrivateKey: z.string().min(1).optional(),
  userId: objectIdSchema,
  chainId: z.number().int(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

const hotWalletSerializedSchema = hotWalletReadSchema.transform(
  ({ _id, userId, ...rest }) => ({
    ...rest,
    id: stringifyObjectId(_id, "hotWallet._id"),
    userId: stringifyObjectId(userId, "hotWallet.userId"),
  }),
);

export type HotWalletSerialized = z.output<typeof hotWalletSerializedSchema>;

export const createHotWalletInputSchema = z.object({
  address: z.string().min(1),
  encryptedPrivateKey: z.string().min(1),
  userId: objectIdStringSchema,
  chainId: z.number().int().positive().optional(),
});

export type CreateHotWalletInput = z.infer<typeof createHotWalletInputSchema>;

const hotWalletAddressProjectionSchema = z.object({
  address: z.string().min(1),
});

export type HotWalletAddressProjection = z.infer<
  typeof hotWalletAddressProjectionSchema
>;

export function serializeHotWallet(doc: unknown): HotWalletSerialized {
  const parsed = hotWalletReadSchema.parse(doc);
  return hotWalletSerializedSchema.parse(parsed);
}

export function serializeHotWallets(docs: unknown[]): HotWalletSerialized[] {
  return docs.map((doc) => serializeHotWallet(doc));
}

export function validateCreateHotWalletInput(
  input: unknown,
): CreateHotWalletInput {
  return createHotWalletInputSchema.parse(input);
}

export function parseHotWalletId(walletId: string): Types.ObjectId {
  return parseObjectId(walletId, "hotWalletId");
}

export function parseHotWalletAddressProjection(
  doc: unknown,
): HotWalletAddressProjection {
  return hotWalletAddressProjectionSchema.parse(doc);
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

export const HotWallet: Model<IHotWalletDocument> =
  mongoose.models.HotWallet ||
  mongoose.model<IHotWalletDocument>("HotWallet", hotWalletSchema);

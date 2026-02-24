import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { z } from "zod/v4";
import { objectId, mongoDate } from "./zod-helpers";

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

/** Full output schema — includes encryptedPrivateKey (for signing operations). */
const hotWalletFullOutputSchema = z
  .object({
    _id: objectId,
    address: z.string(),
    encryptedPrivateKey: z.string(),
    userId: objectId,
    chainId: z.number().int(),
    createdAt: mongoDate,
    updatedAt: mongoDate,
  })
  .transform(({ _id, ...rest }) => ({
    id: _id,
    ...rest,
  }));

/** Public output schema — excludes encryptedPrivateKey (for display). */
const hotWalletPublicOutputSchema = z
  .object({
    _id: objectId,
    address: z.string(),
    userId: objectId,
    chainId: z.number().int(),
    createdAt: mongoDate,
    updatedAt: mongoDate,
  })
  .transform(({ _id, ...rest }) => ({
    id: _id,
    ...rest,
  }));

export type HotWalletFullOutput = z.output<typeof hotWalletFullOutputSchema>;
export type HotWalletPublicOutput = z.output<typeof hotWalletPublicOutputSchema>;

/** Serialize a lean HotWallet document including sensitive fields. */
export function serializeHotWallet(doc: unknown): HotWalletFullOutput {
  return hotWalletFullOutputSchema.parse(doc);
}

/** Serialize a lean HotWallet document excluding sensitive fields (encryptedPrivateKey). */
export function serializeHotWalletPublic(doc: unknown): HotWalletPublicOutput {
  return hotWalletPublicOutputSchema.parse(doc);
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

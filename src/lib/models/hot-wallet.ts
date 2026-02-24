import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { z } from "zod/v4";
import { objectId, mongoDate, renameId, makeSerializer } from "./zod-helpers";

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

const hotWalletRawSchema = z.object({
  _id: objectId,
  address: z.string(),
  encryptedPrivateKey: z.string(),
  userId: objectId,
  chainId: z.number().int(),
  createdAt: mongoDate,
  updatedAt: mongoDate,
});

export const hotWalletFullOutputSchema = hotWalletRawSchema.transform(renameId);
export const hotWalletPublicOutputSchema = hotWalletRawSchema
  .omit({ encryptedPrivateKey: true })
  .transform(renameId);

export type HotWalletFullOutput = z.output<typeof hotWalletFullOutputSchema>;
export type HotWalletPublicOutput = z.output<typeof hotWalletPublicOutputSchema>;

export const serializeHotWallet = makeSerializer(hotWalletFullOutputSchema);
export const serializeHotWalletPublic = makeSerializer(hotWalletPublicOutputSchema);

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

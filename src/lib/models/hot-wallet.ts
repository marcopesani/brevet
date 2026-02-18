import mongoose, { Schema, Document, Model, Types } from "mongoose";

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

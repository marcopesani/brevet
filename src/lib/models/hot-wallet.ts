import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IHotWallet {
  _id: Types.ObjectId;
  address: string;
  encryptedPrivateKey: string;
  userId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IHotWalletDocument extends Omit<IHotWallet, "_id">, Document {}

const hotWalletSchema = new Schema<IHotWalletDocument>(
  {
    address: { type: String, required: true, unique: true },
    encryptedPrivateKey: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  },
  {
    timestamps: true,
    collection: "hotwallets",
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

hotWalletSchema.virtual("id").get(function () {
  return this._id.toString();
});

export const HotWallet: Model<IHotWalletDocument> =
  mongoose.models.HotWallet ||
  mongoose.model<IHotWalletDocument>("HotWallet", hotWalletSchema);

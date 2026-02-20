import mongoose, { Schema, Document, Model, Types } from "mongoose";

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

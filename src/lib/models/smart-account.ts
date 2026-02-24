import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { z } from "zod/v4";
import { objectId, dateToIso, nullableDateToIso, renameId, makeSerializer } from "./zod-helpers";

const defaultChainId = parseInt(
  process.env.NEXT_PUBLIC_CHAIN_ID || "8453",
  10,
);

const sessionKeyStatusEnum = z.enum([
  "pending_grant",
  "active",
  "expired",
  "revoked",
]);

export interface ISmartAccount {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  chainId: number;
  ownerAddress: string;
  smartAccountAddress: string;
  smartAccountVersion: string;
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

const smartAccountRawSchema = z.object({
  _id: objectId,
  userId: objectId,
  chainId: z.number().int(),
  ownerAddress: z.string(),
  smartAccountAddress: z.string(),
  smartAccountVersion: z.string().optional(),
  sessionKeyAddress: z.string(),
  sessionKeyEncrypted: z.string(),
  serializedAccount: z.string().optional(),
  sessionKeyStatus: sessionKeyStatusEnum,
  sessionKeyGrantTxHash: z.string().optional(),
  sessionKeyExpiry: nullableDateToIso.optional(),
  spendLimitPerTx: z.number().optional(),
  spendLimitDaily: z.number().optional(),
  createdAt: dateToIso.optional(),
  updatedAt: dateToIso.optional(),
});

export const smartAccountFullOutputSchema = smartAccountRawSchema.transform(renameId);
export const smartAccountPublicOutputSchema = smartAccountRawSchema
  .omit({ sessionKeyEncrypted: true, serializedAccount: true })
  .transform(renameId);

export type SmartAccountPublicOutput = z.output<typeof smartAccountPublicOutputSchema>;
export type SmartAccountFullOutput = z.output<typeof smartAccountFullOutputSchema>;
export type SmartAccountOutput = SmartAccountPublicOutput;

export const serializeSmartAccount = makeSerializer(smartAccountPublicOutputSchema);
export const serializeSmartAccountFull = makeSerializer(smartAccountFullOutputSchema);

const smartAccountSchema = new Schema<ISmartAccountDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    chainId: { type: Number, required: true, default: defaultChainId },
    ownerAddress: { type: String, required: true },
    smartAccountAddress: { type: String, required: true },
    smartAccountVersion: { type: String, required: true, default: "0.3.3" },
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

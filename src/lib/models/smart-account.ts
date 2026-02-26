import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { z } from "zod/v4";

type SmartAccountDoc = Document & {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  chainId: number;
  ownerAddress: string;
  smartAccountAddress: string;
  smartAccountVersion: string;
  sessionKeyAddress: string;
  sessionKeyEncrypted: string; // sensitive -- excluded from DTO
  serializedAccount?: string;  // sensitive -- excluded from DTO
  sessionKeyStatus: "pending_grant" | "active" | "expired" | "revoked";
  sessionKeyGrantTxHash?: string;
  sessionKeyExpiry?: Date;
  spendLimitPerTx?: number;
  spendLimitDaily?: number;
  createdAt: Date;
  updatedAt: Date;
};

export const SmartAccountDTO = z.object({
  _id: z.instanceof(Types.ObjectId).transform((v) => v.toString()),
  userId: z.instanceof(Types.ObjectId).transform((v) => v.toString()),
  chainId: z.number(),
  ownerAddress: z.string(),
  smartAccountAddress: z.string(),
  smartAccountVersion: z.string(),
  sessionKeyAddress: z.string(),
  sessionKeyStatus: z.enum(["pending_grant", "active", "expired", "revoked"]),
  sessionKeyGrantTxHash: z.string().optional(),
  sessionKeyExpiry: z.instanceof(Date).optional().transform((v) => v?.toISOString()),
  spendLimitPerTx: z.number().optional(),
  spendLimitDaily: z.number().optional(),
  createdAt: z.instanceof(Date).transform((v) => v.toISOString()),
  updatedAt: z.instanceof(Date).transform((v) => v.toISOString()),
});

export type SmartAccountDTO = z.output<typeof SmartAccountDTO>;

export const SmartAccountWithKeyDTO = SmartAccountDTO.extend({
  sessionKeyEncrypted: z.string(),
  serializedAccount: z.string().optional(),
});

export type SmartAccountWithKeyDTO = z.output<typeof SmartAccountWithKeyDTO>;

const smartAccountSchema = new Schema<SmartAccountDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    chainId: { type: Number, required: true },
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
  }
);

smartAccountSchema.index({ userId: 1, chainId: 1 }, { unique: true });

export const SmartAccount: Model<SmartAccountDoc> =
  mongoose.models.SmartAccount ||
  mongoose.model<SmartAccountDoc>("SmartAccount", smartAccountSchema);
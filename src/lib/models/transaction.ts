import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { z } from "zod/v4";

type TransactionDoc = Document & {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  amount: number;
  endpoint: string;
  payTo: string | null;
  asset: string | null;
  scheme: string | null;
  maxTimeoutSeconds: number | null;
  extra: Record<string, unknown> | null;
  txHash: string | null;
  network: string;
  chainId: number;
  status: string;
  type: string;
  responsePayload: string | null;
  errorMessage: string | null;
  responseStatus: number | null;
  createdAt: Date;
};

export const TransactionDTO = z.object({
  _id: z.instanceof(Types.ObjectId).transform((v) => v.toString()),
  userId: z.instanceof(Types.ObjectId).transform((v) => v.toString()),
  amount: z.number(),
  endpoint: z.string(),
  payTo: z.string().nullable(),
  asset: z.string().nullable(),
  scheme: z.string().nullable(),
  maxTimeoutSeconds: z.number().nullable(),
  extra: z.record(z.string(), z.unknown()).nullable(),
  txHash: z.string().nullable(),
  network: z.string(),
  chainId: z.number(),
  status: z.string(),
  type: z.string(),
  responsePayload: z.string().nullable(),
  errorMessage: z.string().nullable(),
  responseStatus: z.number().nullable(),
  createdAt: z.instanceof(Date).transform((v) => v.toISOString()),
});

export type TransactionDTO = z.output<typeof TransactionDTO>;

/** Input for creating a transaction (userId as string; omit _id, createdAt). */
export const TransactionCreateInput = z.object({
  userId: z.string(),
  amount: z.number(),
  endpoint: z.string(),
  network: z.string(),
  chainId: z.number(),
  status: z.string(),
  payTo: z.string().nullable().optional(),
  asset: z.string().nullable().optional(),
  scheme: z.string().nullable().optional(),
  maxTimeoutSeconds: z.number().nullable().optional(),
  extra: z.record(z.string(), z.unknown()).nullable().optional(),
  txHash: z.string().nullable().optional(),
  type: z.string().optional(),
  responsePayload: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  responseStatus: z.number().nullable().optional(),
});
export type TransactionCreateInput = z.output<typeof TransactionCreateInput>;

// --- Mongoose schema ---
const transactionSchema = new Schema<TransactionDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },
    endpoint: { type: String, required: true },
    payTo: { type: String, default: null },
    asset: { type: String, default: null },
    scheme: { type: String, default: null },
    maxTimeoutSeconds: { type: Number, default: null },
    extra: { type: Schema.Types.Mixed, default: null },
    txHash: { type: String, default: null },
    network: { type: String, required: true },
    chainId: { type: Number, required: true },
    status: { type: String, default: "pending" },
    type: { type: String, default: "payment" },
    responsePayload: { type: String, default: null },
    errorMessage: { type: String, default: null },
    responseStatus: { type: Number, default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: "transactions",
  }
);

transactionSchema.index({ userId: 1 });
transactionSchema.index({ chainId: 1 });

export const Transaction: Model<TransactionDoc> =
  mongoose.models.Transaction ||
  mongoose.model<TransactionDoc>("Transaction", transactionSchema);
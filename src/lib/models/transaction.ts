import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { z } from "zod/v4";

type TransactionDoc = Document & {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  amount: number;
  endpoint: string;
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
import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { z } from "zod/v4";
import { objectIdSchema, objectIdStringSchema, parseObjectId, stringifyObjectId } from "@/lib/models/zod";

const defaultChainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || "8453", 10);

export interface ITransaction {
  _id: Types.ObjectId;
  amount: number;
  endpoint: string;
  txHash: string | null;
  network: string;
  chainId: number;
  status: string;
  type: string;
  userId: Types.ObjectId;
  responsePayload: string | null;
  errorMessage: string | null;
  responseStatus: number | null;
  createdAt: Date;
}

export interface ITransactionDocument
  extends Omit<ITransaction, "_id">,
    Document {}

const transactionReadSchema = z.object({
  _id: objectIdSchema,
  amount: z.number().finite(),
  endpoint: z.string().min(1),
  txHash: z.string().nullable(),
  network: z.string().min(1),
  chainId: z.number().int(),
  status: z.string().min(1),
  type: z.string().min(1),
  userId: objectIdSchema,
  responsePayload: z.string().nullable(),
  errorMessage: z.string().nullable(),
  responseStatus: z.number().int().nullable(),
  createdAt: z.date(),
});

const transactionSerializedSchema = transactionReadSchema.transform(
  ({ _id, userId, ...rest }) => ({
    ...rest,
    id: stringifyObjectId(_id, "transaction._id"),
    userId: stringifyObjectId(userId, "transaction.userId"),
  }),
);

export type TransactionSerialized = z.output<typeof transactionSerializedSchema>;

export const createTransactionInputSchema = z.object({
  amount: z.number().finite(),
  endpoint: z.string().min(1),
  txHash: z.string().nullable().optional(),
  network: z.string().min(1),
  chainId: z.number().int().positive().optional(),
  status: z.string().min(1),
  type: z.string().min(1).optional(),
  userId: objectIdStringSchema,
  responsePayload: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  responseStatus: z.number().int().min(0).nullable().optional(),
});

export type CreateTransactionInput = z.infer<typeof createTransactionInputSchema>;

export function serializeTransaction(doc: unknown): TransactionSerialized {
  const parsed = transactionReadSchema.parse(doc);
  return transactionSerializedSchema.parse(parsed);
}

export function serializeTransactions(docs: unknown[]): TransactionSerialized[] {
  return docs.map((doc) => serializeTransaction(doc));
}

export function validateCreateTransactionInput(
  input: unknown,
): CreateTransactionInput {
  return createTransactionInputSchema.parse(input);
}

export function parseTransactionId(transactionId: string): Types.ObjectId {
  return parseObjectId(transactionId, "transactionId");
}

const transactionSchema = new Schema<ITransactionDocument>(
  {
    amount: { type: Number, required: true },
    endpoint: { type: String, required: true },
    txHash: { type: String, default: null },
    network: { type: String, default: "base" },
    chainId: { type: Number, default: defaultChainId, index: true },
    status: { type: String, default: "pending" },
    type: { type: String, default: "payment" },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    responsePayload: { type: String, default: null },
    errorMessage: { type: String, default: null },
    responseStatus: { type: Number, default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: "transactions",
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

transactionSchema.virtual("id").get(function () {
  return this._id.toString();
});

transactionSchema.index({ userId: 1 });

export const Transaction: Model<ITransactionDocument> =
  mongoose.models.Transaction ||
  mongoose.model<ITransactionDocument>("Transaction", transactionSchema);

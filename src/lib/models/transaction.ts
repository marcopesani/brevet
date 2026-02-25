import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { z } from "zod/v4";
import {
  dateLikeSchema,
  objectIdLikeSchema,
  objectIdStringSchema,
  parseJsonWithFallback,
  toObjectId,
} from "@/lib/models/zod-utils";

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

export interface TransactionSerialized {
  id: string;
  amount: number;
  endpoint: string;
  txHash: string | null;
  network: string;
  chainId: number;
  status: string;
  type: string;
  userId: string;
  responsePayload: string | null;
  responseData: unknown | string | null;
  errorMessage: string | null;
  responseStatus: number | null;
  createdAt: Date;
}

const transactionReadSchema = z.object({
  _id: objectIdLikeSchema,
  amount: z.number(),
  endpoint: z.string().min(1),
  txHash: z.string().nullable(),
  network: z.string().min(1),
  chainId: z.number().int(),
  status: z.string().min(1),
  type: z.string().min(1),
  userId: objectIdLikeSchema,
  responsePayload: z.string().nullable(),
  errorMessage: z.string().nullable(),
  responseStatus: z.number().int().nullable(),
  createdAt: dateLikeSchema,
});

const transactionSerializedSchema = z.object({
  id: z.string(),
  amount: z.number(),
  endpoint: z.string().min(1),
  txHash: z.string().nullable(),
  network: z.string().min(1),
  chainId: z.number().int(),
  status: z.string().min(1),
  type: z.string().min(1),
  userId: z.string(),
  responsePayload: z.string().nullable(),
  responseData: z.unknown(),
  errorMessage: z.string().nullable(),
  responseStatus: z.number().int().nullable(),
  createdAt: z.date(),
});

const transactionCreateInputSchema = z
  .object({
    amount: z.number(),
    endpoint: z.string().min(1),
    txHash: z.string().nullable().optional(),
    network: z.string().min(1),
    chainId: z.number().int().positive().optional(),
    status: z.string().min(1),
    type: z.string().min(1).optional(),
    userId: objectIdStringSchema,
    responsePayload: z.string().nullable().optional(),
    errorMessage: z.string().nullable().optional(),
    responseStatus: z.number().int().nonnegative().nullable().optional(),
  })
  .transform((data) => ({
    amount: data.amount,
    endpoint: data.endpoint,
    txHash: data.txHash ?? null,
    network: data.network,
    ...(data.chainId !== undefined && { chainId: data.chainId }),
    status: data.status,
    type: data.type ?? "payment",
    userId: toObjectId(data.userId, "userId"),
    responsePayload: data.responsePayload ?? null,
    errorMessage: data.errorMessage ?? null,
    responseStatus: data.responseStatus ?? null,
  }));

export type TransactionCreateDocumentInput = z.output<
  typeof transactionCreateInputSchema
>;

/** Parse stored response payload JSON when possible, otherwise return raw text. */
export function deserializeTransactionResponsePayload(
  raw: string | null | undefined,
): unknown | string | null {
  return parseJsonWithFallback(raw);
}

/** Validate and normalize create input for Transaction.create(). */
export function validateTransactionCreateInput(
  input: unknown,
): TransactionCreateDocumentInput {
  return transactionCreateInputSchema.parse(input);
}

/** Serialize and validate a transaction document for app-layer usage. */
export function serializeTransaction(input: unknown): TransactionSerialized {
  const parsed = transactionReadSchema.parse(input);
  return transactionSerializedSchema.parse({
    id: parsed._id,
    amount: parsed.amount,
    endpoint: parsed.endpoint,
    txHash: parsed.txHash,
    network: parsed.network,
    chainId: parsed.chainId,
    status: parsed.status,
    type: parsed.type,
    userId: parsed.userId,
    responsePayload: parsed.responsePayload,
    responseData: deserializeTransactionResponsePayload(parsed.responsePayload),
    errorMessage: parsed.errorMessage,
    responseStatus: parsed.responseStatus,
    createdAt: parsed.createdAt,
  });
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

transactionSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret) => serializeTransaction(ret),
});

transactionSchema.set("toObject", {
  virtuals: true,
  transform: (_doc, ret) => serializeTransaction(ret),
});

export const Transaction: Model<ITransactionDocument> =
  mongoose.models.Transaction ||
  mongoose.model<ITransactionDocument>("Transaction", transactionSchema);

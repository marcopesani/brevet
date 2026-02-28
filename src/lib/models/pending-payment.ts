import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { z } from "zod/v4";

type PendingPaymentDoc = Document & {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  url: string;
  method: string;
  amount?: number;
  amountRaw: string | null;
  asset: string | null;
  chainId: number;
  paymentRequirements: string;
  status: string;
  signature: string | null;
  requestBody: string | null;
  requestHeaders: string | null;
  responsePayload: string | null;
  responseStatus: number | null;
  txHash: string | null;
  completedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
};

export const PendingPaymentDTO = z.object({
  _id: z.instanceof(Types.ObjectId).transform((v) => v.toString()),
  userId: z.instanceof(Types.ObjectId).transform((v) => v.toString()),
  url: z.string(),
  method: z.string(),
  amount: z.number().optional(),
  amountRaw: z.string().nullable(),
  asset: z.string().nullable(),
  chainId: z.number(),
  paymentRequirements: z.string(),
  status: z.string(),
  signature: z.string().nullable(),
  requestBody: z.string().nullable(),
  requestHeaders: z.string().nullable(),
  responsePayload: z.string().nullable(),
  responseStatus: z.number().nullable(),
  txHash: z.string().nullable(),
  completedAt: z.instanceof(Date).nullable().transform((v) => v?.toISOString() ?? null),
  expiresAt: z.instanceof(Date).transform((v) => v.toISOString()),
  createdAt: z.instanceof(Date).transform((v) => v.toISOString()),
});

export type PendingPaymentDTO = z.output<typeof PendingPaymentDTO>;

/** Input for creating a pending payment (body/headers map to requestBody/requestHeaders). */
export const PendingPaymentCreateInput = z.object({
  userId: z.string(),
  url: z.string(),
  chainId: z.number(),
  paymentRequirements: z.string(),
  expiresAt: z.date(),
  method: z.string().optional(),
  amount: z.number().optional(),
  amountRaw: z.string().optional(),
  asset: z.string().optional(),
  body: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});
export type PendingPaymentCreateInput = z.output<typeof PendingPaymentCreateInput>;

/** Input for completing a pending payment. */
export const PendingPaymentCompleteInput = z.object({
  responsePayload: z.string(),
  responseStatus: z.number(),
  txHash: z.string().optional(),
});
export type PendingPaymentCompleteInput = z.output<typeof PendingPaymentCompleteInput>;

/** Input for failing a pending payment. */
export const PendingPaymentFailInput = z.object({
  responsePayload: z.string().optional(),
  responseStatus: z.number().optional(),
  error: z.string().optional(),
});
export type PendingPaymentFailInput = z.output<typeof PendingPaymentFailInput>;

const pendingPaymentSchema = new Schema<PendingPaymentDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    url: { type: String, required: true },
    method: { type: String, default: "GET" },
    amount: { type: Number, default: 0 },
    amountRaw: { type: String, default: null },
    asset: { type: String, default: null },
    chainId: { type: Number, required: true },
    paymentRequirements: { type: String, required: true },
    status: { type: String, default: "pending" },
    signature: { type: String, default: null },
    requestBody: { type: String, default: null },
    requestHeaders: { type: String, default: null },
    responsePayload: { type: String, default: null },
    responseStatus: { type: Number, default: null },
    txHash: { type: String, default: null },
    completedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: "pendingpayments",
  }
);

pendingPaymentSchema.index({ userId: 1 });
pendingPaymentSchema.index({ status: 1 });
pendingPaymentSchema.index({ chainId: 1 });
// Compound index for getPendingPayments / getPendingCount queries that filter
// on userId + status + chainId + expiresAt together.
pendingPaymentSchema.index({ userId: 1, status: 1, chainId: 1, expiresAt: -1 });

export const PendingPayment: Model<PendingPaymentDoc> =
  mongoose.models.PendingPayment ||
  mongoose.model<PendingPaymentDoc>("PendingPayment", pendingPaymentSchema);
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

export const PendingPayment: Model<PendingPaymentDoc> =
  mongoose.models.PendingPayment ||
  mongoose.model<PendingPaymentDoc>("PendingPayment", pendingPaymentSchema);
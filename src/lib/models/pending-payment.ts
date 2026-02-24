import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { z } from "zod/v4";
import { objectId, mongoDate, nullableDate, renameId, makeSerializer } from "./zod-helpers";

const defaultChainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || "8453", 10);

export interface IPendingPayment {
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
}

export interface IPendingPaymentDocument
  extends Omit<IPendingPayment, "_id">,
    Document {}

export const pendingPaymentOutputSchema = z
  .object({
    _id: objectId,
    userId: objectId,
    url: z.string(),
    method: z.string(),
    amount: z.number().optional(),
    amountRaw: z.string().nullable().optional(),
    asset: z.string().nullable().optional(),
    chainId: z.number().int(),
    paymentRequirements: z.string(),
    status: z.string(),
    signature: z.string().nullable(),
    requestBody: z.string().nullable(),
    requestHeaders: z.string().nullable(),
    responsePayload: z.string().nullable(),
    responseStatus: z.number().nullable(),
    txHash: z.string().nullable(),
    completedAt: nullableDate,
    expiresAt: mongoDate,
    createdAt: mongoDate,
  })
  .transform(renameId);

export type PendingPaymentOutput = z.output<typeof pendingPaymentOutputSchema>;

export const serializePendingPayment = makeSerializer(pendingPaymentOutputSchema);

const pendingPaymentSchema = new Schema<IPendingPaymentDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    url: { type: String, required: true },
    method: { type: String, default: "GET" },
    amount: { type: Number, default: 0 },
    amountRaw: { type: String, default: null },
    asset: { type: String, default: null },
    chainId: { type: Number, default: defaultChainId, index: true },
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
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

pendingPaymentSchema.virtual("id").get(function () {
  return this._id.toString();
});

pendingPaymentSchema.index({ userId: 1 });
pendingPaymentSchema.index({ status: 1 });

export const PendingPayment: Model<IPendingPaymentDocument> =
  mongoose.models.PendingPayment ||
  mongoose.model<IPendingPaymentDocument>(
    "PendingPayment",
    pendingPaymentSchema
  );

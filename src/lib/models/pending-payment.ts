import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IPendingPayment {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  url: string;
  method: string;
  amount: number;
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

const pendingPaymentSchema = new Schema<IPendingPaymentDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    url: { type: String, required: true },
    method: { type: String, default: "GET" },
    amount: { type: Number, required: true },
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

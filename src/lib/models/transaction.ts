import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface ITransaction {
  _id: Types.ObjectId;
  amount: number;
  endpoint: string;
  txHash: string | null;
  network: string;
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

const transactionSchema = new Schema<ITransactionDocument>(
  {
    amount: { type: Number, required: true },
    endpoint: { type: String, required: true },
    txHash: { type: String, default: null },
    network: { type: String, default: "base" },
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

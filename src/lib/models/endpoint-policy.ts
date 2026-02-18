import mongoose, { Schema, Document, Model, Types } from "mongoose";

const defaultChainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || "8453", 10);

export interface IEndpointPolicy {
  _id: Types.ObjectId;
  endpointPattern: string;
  payFromHotWallet: boolean;
  chainId: number;
  status: string;
  userId: Types.ObjectId;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IEndpointPolicyDocument
  extends Omit<IEndpointPolicy, "_id">,
    Document {}

const endpointPolicySchema = new Schema<IEndpointPolicyDocument>(
  {
    endpointPattern: { type: String, required: true },
    payFromHotWallet: { type: Boolean, default: false },
    status: { type: String, default: "active" },
    chainId: { type: Number, default: defaultChainId },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    archivedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: "endpointpolicies",
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

endpointPolicySchema.virtual("id").get(function () {
  return this._id.toString();
});

endpointPolicySchema.index(
  { userId: 1, endpointPattern: 1, chainId: 1 },
  { unique: true }
);

export const EndpointPolicy: Model<IEndpointPolicyDocument> =
  mongoose.models.EndpointPolicy ||
  mongoose.model<IEndpointPolicyDocument>(
    "EndpointPolicy",
    endpointPolicySchema
  );

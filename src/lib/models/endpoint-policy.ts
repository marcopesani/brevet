import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { z } from "zod/v4";
import { objectId, mongoDate, nullableDate } from "./zod-helpers";

const defaultChainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || "8453", 10);

export interface IEndpointPolicy {
  _id: Types.ObjectId;
  endpointPattern: string;
  autoSign: boolean;
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

/**
 * Output schema for EndpointPolicy.
 * userId is optional because some queries exclude it via .select("-userId").
 */
export const endpointPolicyOutputSchema = z
  .object({
    _id: objectId,
    endpointPattern: z.string(),
    autoSign: z.boolean(),
    chainId: z.number().int(),
    status: z.string(),
    userId: objectId.optional(),
    archivedAt: nullableDate,
    createdAt: mongoDate,
    updatedAt: mongoDate,
  })
  .transform(({ _id, ...rest }) => ({
    id: _id,
    ...rest,
  }));

export type EndpointPolicyOutput = z.output<typeof endpointPolicyOutputSchema>;

/** Validate and serialize a lean EndpointPolicy document. */
export function serializeEndpointPolicy(doc: unknown): EndpointPolicyOutput {
  return endpointPolicyOutputSchema.parse(doc);
}

const endpointPolicySchema = new Schema<IEndpointPolicyDocument>(
  {
    endpointPattern: { type: String, required: true },
    autoSign: { type: Boolean, default: false },
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

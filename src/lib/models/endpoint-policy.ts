import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { z } from "zod/v4";

type EndpointPolicyDoc = Document & {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  endpointPattern: string;
  autoSign: boolean;
  chainId: number;
  status: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export const EndpointPolicyDTO = z.object({
  _id: z.instanceof(Types.ObjectId).transform((v) => v.toString()),
  userId: z.instanceof(Types.ObjectId).transform((v) => v.toString()),
  endpointPattern: z.string(),
  autoSign: z.boolean(),
  chainId: z.number(),
  status: z.string(),
  archivedAt: z.instanceof(Date).nullable().transform((v) => v?.toISOString() ?? null),
  createdAt: z.instanceof(Date).transform((v) => v.toISOString()),
  updatedAt: z.instanceof(Date).transform((v) => v.toISOString()),
});

export type EndpointPolicyDTO = z.output<typeof EndpointPolicyDTO>;

/** Input for creating an endpoint policy (userId passed separately in data layer). */
export const EndpointPolicyCreateInput = z.object({
  endpointPattern: z.string(),
  chainId: z.number(),
  autoSign: z.boolean().optional(),
  status: z.string().optional(),
});
export type EndpointPolicyCreateInput = z.output<typeof EndpointPolicyCreateInput>;

/** Input for updating an endpoint policy (partial). */
export const EndpointPolicyUpdateInput = z.object({
  endpointPattern: z.string().optional(),
  autoSign: z.boolean().optional(),
  status: z.string().optional(),
});
export type EndpointPolicyUpdateInput = z.output<typeof EndpointPolicyUpdateInput>;

const endpointPolicySchema = new Schema<EndpointPolicyDoc>(
  {
    endpointPattern: { type: String, required: true },
    autoSign: { type: Boolean, default: false },
    status: { type: String, default: "active" },
    chainId: { type: Number, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    archivedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: "endpointpolicies",
  }
);

endpointPolicySchema.index(
  { userId: 1, endpointPattern: 1, chainId: 1 },
  { unique: true }
);

export const EndpointPolicy: Model<EndpointPolicyDoc> =
  mongoose.models.EndpointPolicy ||
  mongoose.model<EndpointPolicyDoc>("EndpointPolicy", endpointPolicySchema);
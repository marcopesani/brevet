import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { z } from "zod/v4";
import { objectIdSchema, objectIdStringSchema, parseObjectId, stringifyObjectId } from "@/lib/models/zod";

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

export const endpointPolicyStatusSchema = z.enum([
  "active",
  "draft",
  "archived",
]);

const endpointPolicyReadSchema = z.object({
  _id: objectIdSchema,
  endpointPattern: z.string().url(),
  autoSign: z.boolean(),
  chainId: z.number().int(),
  status: endpointPolicyStatusSchema,
  userId: objectIdSchema.optional(),
  archivedAt: z.date().nullable().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

const endpointPolicySerializedSchema = endpointPolicyReadSchema.transform(
  ({ _id, userId, ...rest }) => ({
    ...rest,
    id: stringifyObjectId(_id, "endpointPolicy._id"),
    ...(userId ? { userId: stringifyObjectId(userId, "endpointPolicy.userId") } : {}),
  }),
);

export type EndpointPolicySerialized = z.output<
  typeof endpointPolicySerializedSchema
>;

export const createEndpointPolicyInputSchema = z.object({
  userId: objectIdStringSchema,
  endpointPattern: z.string().url(),
  autoSign: z.boolean().optional(),
  status: endpointPolicyStatusSchema.optional(),
  chainId: z.number().int().positive().optional(),
});

export type CreateEndpointPolicyInput = z.infer<
  typeof createEndpointPolicyInputSchema
>;

export const updateEndpointPolicyInputSchema = z
  .object({
    endpointPattern: z.string().url().optional(),
    autoSign: z.boolean().optional(),
    status: endpointPolicyStatusSchema.optional(),
  })
  .refine(
    (value) =>
      value.endpointPattern !== undefined ||
      value.autoSign !== undefined ||
      value.status !== undefined,
    {
      message:
        "At least one of endpointPattern, autoSign, or status must be provided",
    },
  );

export type UpdateEndpointPolicyInput = z.infer<
  typeof updateEndpointPolicyInputSchema
>;

export function serializeEndpointPolicy(doc: unknown): EndpointPolicySerialized {
  const parsed = endpointPolicyReadSchema.parse(doc);
  return endpointPolicySerializedSchema.parse(parsed);
}

export function serializeEndpointPolicies(
  docs: unknown[],
): EndpointPolicySerialized[] {
  return docs.map((doc) => serializeEndpointPolicy(doc));
}

export function validateCreateEndpointPolicyInput(
  input: unknown,
): CreateEndpointPolicyInput {
  return createEndpointPolicyInputSchema.parse(input);
}

export function validateUpdateEndpointPolicyInput(
  input: unknown,
): UpdateEndpointPolicyInput {
  return updateEndpointPolicyInputSchema.parse(input);
}

export function parseEndpointPolicyId(policyId: string): Types.ObjectId {
  return parseObjectId(policyId, "policyId");
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

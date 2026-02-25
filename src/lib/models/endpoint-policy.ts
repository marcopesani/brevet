import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { z } from "zod/v4";
import {
  dateLikeSchema,
  nullableDateLikeSchema,
  objectIdLikeSchema,
  objectIdStringSchema,
  toObjectId,
} from "@/lib/models/zod-utils";

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

export interface EndpointPolicySerialized {
  id: string;
  endpointPattern: string;
  autoSign: boolean;
  chainId: number;
  status: string;
  userId: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const endpointPolicyReadSchema = z.object({
  _id: objectIdLikeSchema,
  endpointPattern: z.string().min(1),
  autoSign: z.boolean(),
  chainId: z.number().int(),
  status: z.string().min(1),
  userId: objectIdLikeSchema,
  archivedAt: nullableDateLikeSchema,
  createdAt: dateLikeSchema,
  updatedAt: dateLikeSchema,
});

const endpointPolicySerializedSchema = z.object({
  id: z.string(),
  endpointPattern: z.string().min(1),
  autoSign: z.boolean(),
  chainId: z.number().int(),
  status: z.string().min(1),
  userId: z.string(),
  archivedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const endpointPolicyCreateInputSchema = z
  .object({
    userId: objectIdStringSchema,
    endpointPattern: z.string().url(),
    autoSign: z.boolean().optional(),
    status: z.string().min(1).optional(),
    chainId: z.number().int().positive().optional(),
    archivedAt: z.union([dateLikeSchema, z.null()]).optional(),
  })
  .transform((data) => ({
    userId: toObjectId(data.userId, "userId"),
    endpointPattern: data.endpointPattern,
    ...(data.autoSign !== undefined && { autoSign: data.autoSign }),
    ...(data.status !== undefined && { status: data.status }),
    ...(data.chainId !== undefined && { chainId: data.chainId }),
    ...(data.archivedAt !== undefined && { archivedAt: data.archivedAt }),
  }));

const endpointPolicyUpdateInputSchema = z.object({
  endpointPattern: z.string().url().optional(),
  autoSign: z.boolean().optional(),
  status: z.string().min(1).optional(),
  archivedAt: z.union([dateLikeSchema, z.null()]).optional(),
});

export type EndpointPolicyCreateDocumentInput = z.output<
  typeof endpointPolicyCreateInputSchema
>;
export type EndpointPolicyUpdateDocumentInput = z.output<
  typeof endpointPolicyUpdateInputSchema
>;

/** Validate and normalize create input for EndpointPolicy.create(). */
export function validateEndpointPolicyCreateInput(
  input: unknown,
): EndpointPolicyCreateDocumentInput {
  return endpointPolicyCreateInputSchema.parse(input);
}

/** Validate and normalize update input for EndpointPolicy updates. */
export function validateEndpointPolicyUpdateInput(
  input: unknown,
): EndpointPolicyUpdateDocumentInput {
  return endpointPolicyUpdateInputSchema.parse(input);
}

/** Serialize and validate an endpoint policy document for app-layer usage. */
export function serializeEndpointPolicy(
  input: unknown,
): EndpointPolicySerialized {
  const parsed = endpointPolicyReadSchema.parse(input);
  return endpointPolicySerializedSchema.parse({
    id: parsed._id,
    endpointPattern: parsed.endpointPattern,
    autoSign: parsed.autoSign,
    chainId: parsed.chainId,
    status: parsed.status,
    userId: parsed.userId,
    archivedAt: parsed.archivedAt,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
  });
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

endpointPolicySchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret) => serializeEndpointPolicy(ret),
});

endpointPolicySchema.set("toObject", {
  virtuals: true,
  transform: (_doc, ret) => serializeEndpointPolicy(ret),
});

export const EndpointPolicy: Model<IEndpointPolicyDocument> =
  mongoose.models.EndpointPolicy ||
  mongoose.model<IEndpointPolicyDocument>(
    "EndpointPolicy",
    endpointPolicySchema
  );

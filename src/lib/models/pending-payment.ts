import mongoose, { Schema, Document, Model, Types } from "mongoose";
import type { PaymentRequirements } from "@x402/core/types";
import { z } from "zod/v4";
import { objectIdSchema, objectIdStringSchema, parseObjectId, stringifyObjectId } from "@/lib/models/zod";

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

const pendingPaymentStatusSchema = z.enum([
  "pending",
  "approved",
  "completed",
  "failed",
  "rejected",
  "expired",
]);

const pendingPaymentReadSchema = z.object({
  _id: objectIdSchema,
  userId: objectIdSchema,
  url: z.string().min(1),
  method: z.string().min(1),
  amount: z.number().optional(),
  amountRaw: z.string().nullable(),
  asset: z.string().nullable(),
  chainId: z.number().int(),
  paymentRequirements: z.string().min(1),
  status: pendingPaymentStatusSchema,
  signature: z.string().nullable(),
  requestBody: z.string().nullable(),
  requestHeaders: z.string().nullable(),
  responsePayload: z.string().nullable(),
  responseStatus: z.number().int().nullable(),
  txHash: z.string().nullable(),
  completedAt: z.date().nullable(),
  expiresAt: z.date(),
  createdAt: z.date(),
});

const pendingPaymentSerializedSchema = pendingPaymentReadSchema.transform(
  ({ _id, userId, ...rest }) => ({
    ...rest,
    id: stringifyObjectId(_id, "pendingPayment._id"),
    userId: stringifyObjectId(userId, "pendingPayment.userId"),
    paymentRequirementsParsed: deserializePendingPaymentRequirements(
      rest.paymentRequirements,
      rest.url,
    ),
    requestHeadersParsed: deserializePendingPaymentRequestHeaders(
      rest.requestHeaders,
    ),
    responsePayloadParsed: deserializePendingPaymentResponsePayload(
      rest.responsePayload,
    ),
  }),
);

export type PendingPaymentSerialized = z.output<
  typeof pendingPaymentSerializedSchema
>;

export const createPendingPaymentInputSchema = z.object({
  userId: objectIdStringSchema,
  url: z.string().url(),
  method: z.string().trim().min(1).max(16).optional(),
  amount: z.number().finite().nonnegative().optional(),
  amountRaw: z.string().optional(),
  asset: z.string().optional(),
  chainId: z.number().int().positive().optional(),
  paymentRequirements: z.string().min(1),
  expiresAt: z.date(),
  body: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

export type CreatePendingPaymentInput = z.infer<
  typeof createPendingPaymentInputSchema
>;

export const completePendingPaymentInputSchema = z.object({
  responsePayload: z.string(),
  responseStatus: z.number().int().min(0),
  txHash: z.string().optional(),
});

export type CompletePendingPaymentInput = z.infer<
  typeof completePendingPaymentInputSchema
>;

export const failPendingPaymentInputSchema = z.object({
  responsePayload: z.string().optional(),
  responseStatus: z.number().int().min(0).optional(),
  error: z.string().optional(),
});

export type FailPendingPaymentInput = z.infer<
  typeof failPendingPaymentInputSchema
>;

const paymentRequirementLikeSchema = z
  .object({
    scheme: z.string().optional(),
    network: z.string().optional(),
    asset: z.string().optional(),
    payTo: z.string().optional(),
  })
  .passthrough();

const paymentRequirementsEnvelopeSchema = z
  .object({
    x402Version: z.number().int().optional(),
    resource: z
      .object({
        url: z.string().min(1),
        description: z.string().optional(),
        mimeType: z.string().optional(),
      })
      .passthrough()
      .optional(),
    accepts: z.array(paymentRequirementLikeSchema),
    extensions: z.unknown().optional(),
  })
  .passthrough();

const paymentRequirementsStoredSchema = z.union([
  paymentRequirementsEnvelopeSchema,
  z.array(paymentRequirementLikeSchema),
  paymentRequirementLikeSchema,
]);

const requestHeadersSchema = z.record(z.string(), z.string());

type PaymentRequirementsResource = {
  url: string;
  description: string;
  mimeType: string;
};

export type ParsedPendingPaymentRequirements = {
  isFullFormat: boolean;
  accepts: PaymentRequirements[];
  x402Version: number;
  resource: PaymentRequirementsResource;
  extensions?: unknown;
};

function parseJsonString(value: string, field: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Invalid ${field}: expected JSON string`);
  }
}

function defaultResource(url: string): PaymentRequirementsResource {
  return { url, description: "", mimeType: "" };
}

export function serializePendingPayment(doc: unknown): PendingPaymentSerialized {
  const parsed = pendingPaymentReadSchema.parse(doc);
  return pendingPaymentSerializedSchema.parse(parsed);
}

export function serializePendingPayments(
  docs: unknown[],
): PendingPaymentSerialized[] {
  return docs.map((doc) => serializePendingPayment(doc));
}

export function validateCreatePendingPaymentInput(
  input: unknown,
): CreatePendingPaymentInput {
  return createPendingPaymentInputSchema.parse(input);
}

export function validateCompletePendingPaymentInput(
  input: unknown,
): CompletePendingPaymentInput {
  return completePendingPaymentInputSchema.parse(input);
}

export function validateFailPendingPaymentInput(
  input: unknown,
): FailPendingPaymentInput {
  return failPendingPaymentInputSchema.parse(input);
}

export function parsePendingPaymentId(paymentId: string): Types.ObjectId {
  return parseObjectId(paymentId, "paymentId");
}

export function deserializePendingPaymentRequirements(
  paymentRequirements: string,
  fallbackUrl: string,
): ParsedPendingPaymentRequirements {
  const raw = parseJsonString(paymentRequirements, "paymentRequirements");
  const parsed = paymentRequirementsStoredSchema.parse(raw);

  if (Array.isArray(parsed)) {
    return {
      isFullFormat: false,
      accepts: parsed as PaymentRequirements[],
      x402Version: 1,
      resource: defaultResource(fallbackUrl),
    };
  }

  if ("accepts" in parsed) {
    return {
      isFullFormat: true,
      accepts: parsed.accepts as PaymentRequirements[],
      x402Version: parsed.x402Version ?? 1,
      resource: parsed.resource
        ? {
            url: parsed.resource.url,
            description: parsed.resource.description ?? "",
            mimeType: parsed.resource.mimeType ?? "",
          }
        : defaultResource(fallbackUrl),
      ...(parsed.extensions !== undefined && { extensions: parsed.extensions }),
    };
  }

  return {
    isFullFormat: false,
    accepts: [parsed as PaymentRequirements],
    x402Version: 1,
    resource: defaultResource(fallbackUrl),
  };
}

export function deserializePendingPaymentRequestHeaders(
  requestHeaders: string | null,
): Record<string, string> {
  if (!requestHeaders) return {};
  const raw = parseJsonString(requestHeaders, "requestHeaders");
  return requestHeadersSchema.parse(raw);
}

export function deserializePendingPaymentResponsePayload(
  responsePayload: string | null,
): unknown {
  if (responsePayload === null) return null;
  try {
    return JSON.parse(responsePayload);
  } catch {
    return responsePayload;
  }
}

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

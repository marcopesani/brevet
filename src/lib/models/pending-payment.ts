import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { z } from "zod/v4";
import {
  dateLikeSchema,
  nullableDateLikeSchema,
  objectIdLikeSchema,
  objectIdStringSchema,
  parseJsonOrThrow,
  parseJsonRecordOrThrow,
  parseJsonWithFallback,
  toObjectId,
} from "@/lib/models/zod-utils";

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

export interface PendingPaymentSerialized {
  id: string;
  userId: string;
  url: string;
  method: string;
  amount: number;
  amountRaw: string | null;
  asset: string | null;
  chainId: number;
  paymentRequirements: string;
  paymentRequirementsData: unknown;
  status: string;
  signature: string | null;
  requestBody: string | null;
  requestHeaders: string | null;
  requestHeadersData: Record<string, string>;
  responsePayload: string | null;
  responseData: unknown | string | null;
  responseStatus: number | null;
  txHash: string | null;
  completedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

const pendingPaymentReadSchema = z.object({
  _id: objectIdLikeSchema,
  userId: objectIdLikeSchema,
  url: z.string().min(1),
  method: z.string().min(1),
  amount: z.number(),
  amountRaw: z.string().nullable(),
  asset: z.string().nullable(),
  chainId: z.number().int(),
  paymentRequirements: z.string().min(1),
  status: z.string().min(1),
  signature: z.string().nullable(),
  requestBody: z.string().nullable(),
  requestHeaders: z.string().nullable(),
  responsePayload: z.string().nullable(),
  responseStatus: z.number().int().nullable(),
  txHash: z.string().nullable(),
  completedAt: nullableDateLikeSchema,
  expiresAt: dateLikeSchema,
  createdAt: dateLikeSchema,
});

const pendingPaymentSerializedSchema = z.object({
  id: z.string(),
  userId: z.string(),
  url: z.string().min(1),
  method: z.string().min(1),
  amount: z.number(),
  amountRaw: z.string().nullable(),
  asset: z.string().nullable(),
  chainId: z.number().int(),
  paymentRequirements: z.string().min(1),
  paymentRequirementsData: z.unknown(),
  status: z.string().min(1),
  signature: z.string().nullable(),
  requestBody: z.string().nullable(),
  requestHeaders: z.string().nullable(),
  requestHeadersData: z.record(z.string(), z.string()),
  responsePayload: z.string().nullable(),
  responseData: z.unknown(),
  responseStatus: z.number().int().nullable(),
  txHash: z.string().nullable(),
  completedAt: z.date().nullable(),
  expiresAt: z.date(),
  createdAt: z.date(),
});

const paymentRequirementsJsonSchema = z.string().min(1).superRefine((value, ctx) => {
  try {
    JSON.parse(value);
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "paymentRequirements must be valid JSON",
    });
  }
});

const pendingPaymentCreateInputSchema = z
  .object({
    userId: objectIdStringSchema,
    url: z.string().max(2048).url(),
    method: z.string().min(1).optional(),
    amount: z.number().nonnegative().optional(),
    amountRaw: z.string().optional(),
    asset: z.string().optional(),
    chainId: z.number().int().positive().optional(),
    paymentRequirements: paymentRequirementsJsonSchema,
    expiresAt: dateLikeSchema,
    body: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional(),
  })
  .transform((data) => ({
    userId: toObjectId(data.userId, "userId"),
    url: data.url,
    method: data.method ?? "GET",
    amount: data.amount ?? 0,
    ...(data.amountRaw !== undefined &&
      data.amountRaw !== "" && { amountRaw: data.amountRaw }),
    ...(data.asset !== undefined && data.asset !== "" && { asset: data.asset }),
    ...(data.chainId !== undefined && { chainId: data.chainId }),
    paymentRequirements: data.paymentRequirements,
    expiresAt: data.expiresAt,
    requestBody: data.body ?? null,
    requestHeaders:
      data.headers && Object.keys(data.headers).length > 0
        ? JSON.stringify(data.headers)
        : null,
  }));

const pendingPaymentCompleteInputSchema = z.object({
  responsePayload: z.string(),
  responseStatus: z.number().int().nonnegative(),
  txHash: z.string().optional(),
});

const pendingPaymentFailInputSchema = z.object({
  responsePayload: z.string().optional(),
  responseStatus: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
});

const pendingPaymentApproveInputSchema = z.object({
  signature: z.string().min(1),
});

export type PendingPaymentCreateDocumentInput = z.output<
  typeof pendingPaymentCreateInputSchema
>;
export type PendingPaymentCompleteInput = z.input<
  typeof pendingPaymentCompleteInputSchema
>;
export type PendingPaymentFailInput = z.input<typeof pendingPaymentFailInputSchema>;

/** Parse and validate stored payment requirements JSON. */
export function deserializePendingPaymentRequirements(raw: string): unknown {
  return parseJsonOrThrow(raw, "pendingpayments.paymentRequirements");
}

/** Parse and validate stored request headers JSON. */
export function deserializePendingPaymentRequestHeaders(
  raw: string | null | undefined,
): Record<string, string> {
  return parseJsonRecordOrThrow(raw, "pendingpayments.requestHeaders");
}

/** Parse stored response payload JSON when possible, otherwise return raw text. */
export function deserializePendingPaymentResponsePayload(
  raw: string | null | undefined,
): unknown | string | null {
  return parseJsonWithFallback(raw);
}

/** Validate and normalize create input for PendingPayment.create(). */
export function validatePendingPaymentCreateInput(
  input: unknown,
): PendingPaymentCreateDocumentInput {
  return pendingPaymentCreateInputSchema.parse(input);
}

/** Validate completePendingPayment update payload. */
export function validatePendingPaymentCompleteInput(
  input: unknown,
): z.output<typeof pendingPaymentCompleteInputSchema> {
  return pendingPaymentCompleteInputSchema.parse(input);
}

/** Validate failPendingPayment update payload. */
export function validatePendingPaymentFailInput(
  input: unknown,
): z.output<typeof pendingPaymentFailInputSchema> {
  return pendingPaymentFailInputSchema.parse(input);
}

/** Validate approvePendingPayment signature payload. */
export function validatePendingPaymentApproveInput(
  input: unknown,
): z.output<typeof pendingPaymentApproveInputSchema> {
  return pendingPaymentApproveInputSchema.parse(input);
}

/** Serialize and validate a pending payment document for app-layer usage. */
export function serializePendingPayment(input: unknown): PendingPaymentSerialized {
  const parsed = pendingPaymentReadSchema.parse(input);
  return pendingPaymentSerializedSchema.parse({
    id: parsed._id,
    userId: parsed.userId,
    url: parsed.url,
    method: parsed.method,
    amount: parsed.amount,
    amountRaw: parsed.amountRaw,
    asset: parsed.asset,
    chainId: parsed.chainId,
    paymentRequirements: parsed.paymentRequirements,
    paymentRequirementsData: deserializePendingPaymentRequirements(
      parsed.paymentRequirements,
    ),
    status: parsed.status,
    signature: parsed.signature,
    requestBody: parsed.requestBody,
    requestHeaders: parsed.requestHeaders,
    requestHeadersData: deserializePendingPaymentRequestHeaders(
      parsed.requestHeaders,
    ),
    responsePayload: parsed.responsePayload,
    responseData: deserializePendingPaymentResponsePayload(parsed.responsePayload),
    responseStatus: parsed.responseStatus,
    txHash: parsed.txHash,
    completedAt: parsed.completedAt,
    expiresAt: parsed.expiresAt,
    createdAt: parsed.createdAt,
  });
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

pendingPaymentSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret) => serializePendingPayment(ret),
});

pendingPaymentSchema.set("toObject", {
  virtuals: true,
  transform: (_doc, ret) => serializePendingPayment(ret),
});

export const PendingPayment: Model<IPendingPaymentDocument> =
  mongoose.models.PendingPayment ||
  mongoose.model<IPendingPaymentDocument>(
    "PendingPayment",
    pendingPaymentSchema
  );

import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { z } from "zod/v4";
import {
  dateLikeSchema,
  objectIdLikeSchema,
} from "@/lib/models/zod-utils";

export interface IUser {
  _id: Types.ObjectId;
  email: string | null;
  walletAddress: string | null;
  humanHash: string | null;
  apiKeyHash: string | null;
  apiKeyPrefix: string | null;
  enabledChains: number[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserDocument extends Omit<IUser, "_id">, Document {}

export interface UserSerialized {
  id: string;
  email: string | null;
  walletAddress: string | null;
  humanHash: string | null;
  apiKeyPrefix: string | null;
  enabledChains: number[];
  createdAt: Date;
  updatedAt: Date;
}

export interface UserSerializedWithSecrets extends UserSerialized {
  apiKeyHash: string | null;
}

const userReadSchema = z.object({
  _id: objectIdLikeSchema,
  email: z.string().nullable().optional(),
  walletAddress: z.string().nullable().optional(),
  humanHash: z.string().nullable().optional(),
  apiKeyHash: z.string().nullable().optional(),
  apiKeyPrefix: z.string().nullable().optional(),
  enabledChains: z.array(z.number().int()).optional(),
  createdAt: dateLikeSchema,
  updatedAt: dateLikeSchema,
});

const userPublicSchema = z.object({
  id: z.string(),
  email: z.string().nullable(),
  walletAddress: z.string().nullable(),
  humanHash: z.string().nullable(),
  apiKeyPrefix: z.string().nullable(),
  enabledChains: z.array(z.number().int()),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const userWithSecretsSchema = userPublicSchema.extend({
  apiKeyHash: z.string().nullable(),
});

const userCreateInputSchema = z.object({
  email: z.string().email().nullable().optional(),
  walletAddress: z.string().min(1).nullable().optional(),
  humanHash: z.string().min(1).nullable().optional(),
  apiKeyHash: z.string().min(1).nullable().optional(),
  apiKeyPrefix: z.string().min(1).nullable().optional(),
  enabledChains: z.array(z.number().int()).optional(),
});

const userEnabledChainsUpdateSchema = z.object({
  enabledChains: z.array(z.number().int()),
});

const userApiKeyUpdateSchema = z.object({
  apiKeyHash: z.string().min(1),
  apiKeyPrefix: z.string().min(1),
});

export type UserCreateInput = z.output<typeof userCreateInputSchema>;

/** Validate user creation/upsert payload. */
export function validateUserCreateInput(input: unknown): UserCreateInput {
  return userCreateInputSchema.parse(input);
}

/** Validate enabled-chains update payload. */
export function validateUserEnabledChainsUpdate(input: unknown): z.output<
  typeof userEnabledChainsUpdateSchema
> {
  return userEnabledChainsUpdateSchema.parse(input);
}

/** Validate API-key update payload. */
export function validateUserApiKeyUpdate(input: unknown): z.output<
  typeof userApiKeyUpdateSchema
> {
  return userApiKeyUpdateSchema.parse(input);
}

/** Serialize and validate a user document for public app-layer usage. */
export function serializeUser(input: unknown): UserSerialized {
  const parsed = userReadSchema.parse(input);
  return userPublicSchema.parse({
    id: parsed._id,
    email: parsed.email ?? null,
    walletAddress: parsed.walletAddress ?? null,
    humanHash: parsed.humanHash ?? null,
    apiKeyPrefix: parsed.apiKeyPrefix ?? null,
    enabledChains: parsed.enabledChains ?? [],
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
  });
}

/**
 * Serialize and validate a user document including API-key hash.
 * Use only on trusted server-side paths that need secret key material.
 */
export function serializeUserWithSecrets(
  input: unknown,
): UserSerializedWithSecrets {
  const parsed = userReadSchema.parse(input);
  return userWithSecretsSchema.parse({
    ...serializeUser(parsed),
    apiKeyHash: parsed.apiKeyHash ?? null,
  });
}

const userSchema = new Schema<IUserDocument>(
  {
    email: { type: String, default: null },
    walletAddress: { type: String, default: null },
    humanHash: { type: String },
    apiKeyHash: { type: String, default: null },
    apiKeyPrefix: { type: String, default: null },
    enabledChains: { type: [Number], default: [] },
  },
  {
    timestamps: true,
    collection: "users",
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

userSchema.virtual("id").get(function () {
  return this._id.toString();
});

userSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret) => serializeUser(ret),
});

userSchema.set("toObject", {
  virtuals: true,
  transform: (_doc, ret) => serializeUser(ret),
});

userSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { email: { $exists: true, $ne: null } },
  }
);
userSchema.index({ walletAddress: 1 }, { unique: true, sparse: true });
userSchema.index({ humanHash: 1 }, { unique: true, sparse: true });
userSchema.index(
  { apiKeyHash: 1 },
  {
    unique: true,
    partialFilterExpression: { apiKeyHash: { $exists: true, $ne: null } },
  }
);

export const User: Model<IUserDocument> =
  mongoose.models.User || mongoose.model<IUserDocument>("User", userSchema);

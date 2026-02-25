import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { z } from "zod/v4";
import { objectIdSchema, parseObjectId, stringifyObjectId } from "@/lib/models/zod";

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

const userReadSchema = z.object({
  _id: objectIdSchema,
  email: z.string().nullable(),
  walletAddress: z.string().nullable(),
  humanHash: z.string().nullable().optional(),
  apiKeyHash: z.string().nullable(),
  apiKeyPrefix: z.string().nullable(),
  enabledChains: z.array(z.number().int()),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

const userSerializedSchema = userReadSchema.transform(({ _id, ...rest }) => ({
  ...rest,
  id: stringifyObjectId(_id, "user._id"),
  humanHash: rest.humanHash ?? null,
}));

export type UserSerialized = z.output<typeof userSerializedSchema>;

export const upsertUserInputSchema = z.object({
  walletAddress: z.string().min(1),
});

export type UpsertUserInput = z.infer<typeof upsertUserInputSchema>;

const userIdProjectionSchema = z.object({
  _id: objectIdSchema,
});

export type UserIdProjection = z.infer<typeof userIdProjectionSchema>;

const userEnabledChainsProjectionSchema = z.object({
  enabledChains: z.array(z.number().int()).optional(),
});

export type UserEnabledChainsProjection = z.infer<
  typeof userEnabledChainsProjectionSchema
>;

export function serializeUser(doc: unknown): UserSerialized {
  const parsed = userReadSchema.parse(doc);
  return userSerializedSchema.parse(parsed);
}

export function serializeUsers(docs: unknown[]): UserSerialized[] {
  return docs.map((doc) => serializeUser(doc));
}

export function validateUpsertUserInput(input: unknown): UpsertUserInput {
  return upsertUserInputSchema.parse(input);
}

export function parseUserId(userId: string): Types.ObjectId {
  return parseObjectId(userId, "userId");
}

export function parseUserIdProjection(doc: unknown): UserIdProjection {
  return userIdProjectionSchema.parse(doc);
}

export function parseUserEnabledChainsProjection(
  doc: unknown,
): UserEnabledChainsProjection {
  return userEnabledChainsProjectionSchema.parse(doc);
}

export function parseApiKeyHashProjection(
  doc: unknown,
): { apiKeyHash: string | null | undefined } {
  return z.object({ apiKeyHash: z.string().nullable().optional() }).parse(doc);
}

export function parseApiKeyPrefixProjection(
  doc: unknown,
): { apiKeyPrefix: string | null | undefined } {
  return z
    .object({ apiKeyPrefix: z.string().nullable().optional() })
    .parse(doc);
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

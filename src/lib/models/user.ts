import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { z } from "zod/v4";
import { objectId, mongoDate } from "./zod-helpers";

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

/** Zod schema for validating and serializing a lean User document. */
export const userOutputSchema = z
  .object({
    _id: objectId,
    email: z.string().nullable(),
    walletAddress: z.string().nullable(),
    humanHash: z.string().nullable().optional(),
    apiKeyHash: z.string().nullable().optional(),
    apiKeyPrefix: z.string().nullable().optional(),
    enabledChains: z.array(z.number().int()),
    createdAt: mongoDate,
    updatedAt: mongoDate,
  })
  .transform(({ _id, ...rest }) => ({
    id: _id,
    ...rest,
  }));

export type UserOutput = z.output<typeof userOutputSchema>;

/** Validate and serialize a lean User document (from .lean() or .toObject()). */
export function serializeUser(doc: unknown): UserOutput {
  return userOutputSchema.parse(doc);
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

import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { z } from "zod/v4";

type UserDoc = Document & {
  _id: Types.ObjectId;
  email: string | null;
  walletAddress: string | null;
  humanHash: string | null;
  apiKeyHash: string | null;   // sensitive -- excluded from DTO
  apiKeyPrefix: string | null;
  enabledChains: number[];
  createdAt: Date;
  updatedAt: Date;
};

export const UserDTO = z.object({
  _id: z.instanceof(Types.ObjectId).transform((v) => v.toString()),
  email: z.string().nullable(),
  walletAddress: z.string().nullable(),
  humanHash: z.string().nullable(),
  apiKeyPrefix: z.string().nullable(),
  enabledChains: z.array(z.number()),
  createdAt: z.instanceof(Date).transform((v) => v.toISOString()),
  updatedAt: z.instanceof(Date).transform((v) => v.toISOString()),
});

export type UserDTO = z.output<typeof UserDTO>;

const userSchema = new Schema<UserDoc>(
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
  }
);

userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $exists: true, $ne: null } } }
);
userSchema.index({ walletAddress: 1 }, { unique: true, sparse: true });
userSchema.index({ humanHash: 1 }, { unique: true, sparse: true });
userSchema.index(
  { apiKeyHash: 1 },
  { unique: true, partialFilterExpression: { apiKeyHash: { $exists: true, $ne: null } } }
);

export const User: Model<UserDoc> =
  mongoose.models.User || mongoose.model<UserDoc>("User", userSchema);
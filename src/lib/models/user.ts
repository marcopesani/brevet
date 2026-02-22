import mongoose, { Schema, Document, Model, Types } from "mongoose";

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

import { Types } from "mongoose";
import { User } from "@/lib/models/user";
import { connectDB } from "@/lib/db";
import { humanHash } from "@/lib/human-hash";

/**
 * Find or create a user by wallet address.
 * Generates a humanHash on creation. Backfills humanHash for existing users that lack one.
 */
export async function upsertUser(walletAddress: string): Promise<{ _id: string; humanHash: string | null }> {
  await connectDB();

  let user = await User.findOne({ walletAddress });

  if (!user) {
    user = await User.create({ walletAddress });
    const hash = humanHash(user._id.toHexString());
    user.humanHash = hash;
    await user.save();
    return { _id: user._id.toString(), humanHash: hash };
  }

  if (!user.humanHash) {
    const hash = humanHash(user._id.toHexString());
    user.humanHash = hash;
    await user.save();
  }

  return { _id: user._id.toString(), humanHash: user.humanHash ?? null };
}

/**
 * Look up a user by their human-readable hash.
 * Returns the userId string, or null if no user matches.
 */
export async function findByHumanHash(hash: string): Promise<string | null> {
  await connectDB();
  const user = await User.findOne({ humanHash: hash }).lean();
  if (!user) return null;
  return user._id.toString();
}

/**
 * Get the human-readable hash for a user by their userId.
 * Returns the humanHash string, or null if not found.
 */
export async function getUserHumanHash(userId: string): Promise<string | null> {
  await connectDB();
  const user = await User.findById(new Types.ObjectId(userId)).lean();
  if (!user) return null;
  return user.humanHash ?? null;
}

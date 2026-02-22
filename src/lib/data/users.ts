import { randomBytes, createHash } from "crypto";
import { Types } from "mongoose";
import { User } from "@/lib/models/user";
import { connectDB } from "@/lib/db";

export interface OnboardingState {
  currentStep: number;
  completedAt: string | null;
  dismissedAt: string | null;
  skippedSteps: number[];
  firstMcpCallAt: string | null;
}

const API_KEY_PREFIX = "brv_";

/** Generate a raw API key: brv_ + 32 random hex chars (128 bits of entropy). */
function generateApiKey(): string {
  return API_KEY_PREFIX + randomBytes(16).toString("hex");
}

/** SHA-256 hash of a raw API key for storage. */
function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/**
 * Ensure the user has an API key. Idempotent — if the user already has one,
 * returns { created: false }. Otherwise generates a new key, stores the hash
 * and prefix, and returns { created: true, rawKey }.
 */
export async function ensureApiKey(
  userId: string,
): Promise<{ created: true; rawKey: string } | { created: false }> {
  await connectDB();
  const userObjectId = new Types.ObjectId(userId);

  const user = await User.findById(userObjectId).select("apiKeyHash").lean();
  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  if (user.apiKeyHash) {
    return { created: false };
  }

  const rawKey = generateApiKey();
  const hash = hashApiKey(rawKey);
  const prefix = rawKey.slice(0, 8);

  try {
    const result = await User.updateOne(
      { _id: userObjectId, apiKeyHash: null },
      { $set: { apiKeyHash: hash, apiKeyPrefix: prefix } },
    );

    if (result.modifiedCount === 0) {
      // Another request already set the key (race condition)
      return { created: false };
    }

    return { created: true, rawKey };
  } catch (err: unknown) {
    const isDuplicateKeyError =
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: number }).code === 11000;
    if (isDuplicateKeyError) {
      return { created: false };
    }
    throw err;
  }
}

/**
 * Look up a user by raw API key. Hashes the input and finds the user
 * by the stored hash. Returns { userId } or null if not found.
 */
export async function getUserByApiKey(
  rawKey: string,
): Promise<{ userId: string } | null> {
  await connectDB();
  const hash = hashApiKey(rawKey);

  const user = await User.findOne({ apiKeyHash: hash }).select("_id").lean();
  if (!user) {
    return null;
  }

  return { userId: user._id.toString() };
}

/**
 * Rotate the user's API key. Generates a new key and atomically replaces
 * the old hash and prefix. Returns the new raw key.
 */
export async function rotateApiKey(
  userId: string,
): Promise<{ rawKey: string }> {
  await connectDB();
  const userObjectId = new Types.ObjectId(userId);

  const rawKey = generateApiKey();
  const hash = hashApiKey(rawKey);
  const prefix = rawKey.slice(0, 8);

  const result = await User.updateOne(
    { _id: userObjectId },
    { $set: { apiKeyHash: hash, apiKeyPrefix: prefix } },
  );

  if (result.matchedCount === 0) {
    throw new Error(`User not found: ${userId}`);
  }

  return { rawKey };
}

/**
 * Get the stored API key prefix for display (e.g. "brv_a1b2").
 * Returns null if the user has no API key.
 */
export async function getApiKeyPrefix(
  userId: string,
): Promise<string | null> {
  await connectDB();
  const userObjectId = new Types.ObjectId(userId);

  const user = await User.findById(userObjectId)
    .select("apiKeyPrefix")
    .lean();

  if (!user) {
    return null;
  }

  return user.apiKeyPrefix ?? null;
}

/**
 * Get the current onboarding state for a user.
 * Returns ISO strings for dates (not Date objects) so the result
 * is safe to pass across the RSC Server→Client boundary.
 */
export async function getOnboardingState(
  userId: string,
): Promise<OnboardingState> {
  await connectDB();
  const userObjectId = new Types.ObjectId(userId);

  const user = await User.findById(userObjectId)
    .select(
      "onboardingStep onboardingCompletedAt onboardingSkippedSteps onboardingDismissedAt firstMcpCallAt",
    )
    .lean();

  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  return {
    currentStep: user.onboardingStep ?? 0,
    completedAt: user.onboardingCompletedAt
      ? user.onboardingCompletedAt.toISOString()
      : null,
    dismissedAt: user.onboardingDismissedAt
      ? user.onboardingDismissedAt.toISOString()
      : null,
    skippedSteps: user.onboardingSkippedSteps ?? [],
    firstMcpCallAt: user.firstMcpCallAt
      ? user.firstMcpCallAt.toISOString()
      : null,
  };
}

/**
 * Advance onboarding to a specific step. If `skipped` is true,
 * the step number is added to `onboardingSkippedSteps`.
 * When step reaches 3, `onboardingCompletedAt` is set automatically.
 */
export async function updateOnboardingStep(
  userId: string,
  step: number,
  skipped?: boolean,
): Promise<void> {
  await connectDB();
  const userObjectId = new Types.ObjectId(userId);

  const update: Record<string, unknown> = {
    $set: { onboardingStep: step },
  };

  if (skipped) {
    update.$addToSet = { onboardingSkippedSteps: step };
  }

  if (step >= 3) {
    (update.$set as Record<string, unknown>).onboardingCompletedAt = new Date();
  }

  const result = await User.updateOne({ _id: userObjectId }, update);

  if (result.matchedCount === 0) {
    throw new Error(`User not found: ${userId}`);
  }
}

/**
 * Mark onboarding as fully complete.
 */
export async function completeOnboarding(userId: string): Promise<void> {
  await connectDB();
  const userObjectId = new Types.ObjectId(userId);

  const result = await User.updateOne(
    { _id: userObjectId },
    { $set: { onboardingStep: 3, onboardingCompletedAt: new Date() } },
  );

  if (result.matchedCount === 0) {
    throw new Error(`User not found: ${userId}`);
  }
}

/**
 * Dismiss onboarding — user exits wizard early.
 * Sets `onboardingDismissedAt` which prevents /dashboard redirect.
 */
export async function dismissOnboarding(userId: string): Promise<void> {
  await connectDB();
  const userObjectId = new Types.ObjectId(userId);

  const result = await User.updateOne(
    { _id: userObjectId },
    { $set: { onboardingDismissedAt: new Date() } },
  );

  if (result.matchedCount === 0) {
    throw new Error(`User not found: ${userId}`);
  }
}

/**
 * Clear dismissal — user re-enters wizard via banner "Continue Setup" link.
 * Resets `onboardingDismissedAt` to null.
 */
export async function resumeOnboarding(userId: string): Promise<void> {
  await connectDB();
  const userObjectId = new Types.ObjectId(userId);

  const result = await User.updateOne(
    { _id: userObjectId },
    { $set: { onboardingDismissedAt: null } },
  );

  if (result.matchedCount === 0) {
    throw new Error(`User not found: ${userId}`);
  }
}

/**
 * Record an MCP call for a user. Sets `firstMcpCallAt` only if null
 * (first call ever), and always updates `lastMcpCallAt`.
 */
export async function recordMcpCall(userId: string): Promise<void> {
  await connectDB();
  const userObjectId = new Types.ObjectId(userId);
  const now = new Date();

  await User.updateOne(
    { _id: userObjectId, firstMcpCallAt: null },
    { $set: { firstMcpCallAt: now } },
  );

  await User.updateOne(
    { _id: userObjectId },
    { $set: { lastMcpCallAt: now } },
  );
}

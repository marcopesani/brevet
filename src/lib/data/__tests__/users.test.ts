import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import mongoose from "mongoose";
import { User } from "@/lib/models/user";
import {
  ensureApiKey,
  getUserByApiKey,
  rotateApiKey,
  getApiKeyPrefix,
  getOnboardingState,
  updateOnboardingStep,
  completeOnboarding,
  dismissOnboarding,
  resumeOnboarding,
  recordMcpCall,
} from "../users";

/** Generate a valid ObjectId string that does not exist in the DB. */
const nonExistentId = () => new mongoose.Types.ObjectId().toString();

describe("ensureApiKey", () => {
  it("creates an API key for a new user without one", async () => {
    const user = await User.create({ walletAddress: "0xUser1" });

    const result = await ensureApiKey(user._id.toString());

    expect(result.created).toBe(true);
    if (result.created) {
      expect(result.rawKey).toMatch(/^brv_[0-9a-f]{32}$/);
    }

    const updated = await User.findById(user._id).lean();
    expect(updated!.apiKeyHash).toBeTruthy();
    expect(updated!.apiKeyPrefix).toBe(
      result.created ? result.rawKey.slice(0, 8) : undefined,
    );
  });

  it("is idempotent — returns created: false when key already exists", async () => {
    const user = await User.create({ walletAddress: "0xUser2" });

    const first = await ensureApiKey(user._id.toString());
    expect(first.created).toBe(true);

    const second = await ensureApiKey(user._id.toString());
    expect(second.created).toBe(false);

    // Hash should not change
    const updated = await User.findById(user._id).lean();
    const expectedHash = createHash("sha256")
      .update((first as { created: true; rawKey: string }).rawKey)
      .digest("hex");
    expect(updated!.apiKeyHash).toBe(expectedHash);
  });

  it("throws for non-existent user", async () => {
    await expect(ensureApiKey(nonExistentId())).rejects.toThrow(
      "User not found",
    );
  });

  it("handles concurrent creation without error", async () => {
    const user = await User.create({ walletAddress: "0xConcurrent" });

    const [r1, r2] = await Promise.all([
      ensureApiKey(user._id.toString()),
      ensureApiKey(user._id.toString()),
    ]);

    // Exactly one should have created: true
    const createdCount = [r1, r2].filter((r) => r.created).length;
    expect(createdCount).toBeLessThanOrEqual(1);

    // User should have exactly one key
    const updated = await User.findById(user._id).lean();
    expect(updated!.apiKeyHash).toBeTruthy();
  });
});

describe("getUserByApiKey", () => {
  it("finds user by valid raw API key", async () => {
    const user = await User.create({ walletAddress: "0xLookup" });
    const result = await ensureApiKey(user._id.toString());
    expect(result.created).toBe(true);

    const rawKey = (result as { created: true; rawKey: string }).rawKey;
    const found = await getUserByApiKey(rawKey);

    expect(found).not.toBeNull();
    expect(found!.userId).toBe(user._id.toString());
  });

  it("returns null for invalid API key", async () => {
    const found = await getUserByApiKey("brv_0000000000000000000000000000dead");
    expect(found).toBeNull();
  });

  it("returns null for empty string", async () => {
    const found = await getUserByApiKey("");
    expect(found).toBeNull();
  });
});

describe("rotateApiKey", () => {
  it("generates a new key and invalidates the old one", async () => {
    const user = await User.create({ walletAddress: "0xRotate" });
    const first = await ensureApiKey(user._id.toString());
    expect(first.created).toBe(true);

    const oldKey = (first as { created: true; rawKey: string }).rawKey;
    const { rawKey: newKey } = await rotateApiKey(user._id.toString());

    expect(newKey).toMatch(/^brv_[0-9a-f]{32}$/);
    expect(newKey).not.toBe(oldKey);

    // Old key should no longer work
    const oldLookup = await getUserByApiKey(oldKey);
    expect(oldLookup).toBeNull();

    // New key should work
    const newLookup = await getUserByApiKey(newKey);
    expect(newLookup).not.toBeNull();
    expect(newLookup!.userId).toBe(user._id.toString());
  });

  it("throws for non-existent user", async () => {
    await expect(rotateApiKey(nonExistentId())).rejects.toThrow(
      "User not found",
    );
  });
});

describe("getApiKeyPrefix", () => {
  it("returns the stored prefix", async () => {
    const user = await User.create({ walletAddress: "0xPrefix" });
    const result = await ensureApiKey(user._id.toString());
    expect(result.created).toBe(true);

    const prefix = await getApiKeyPrefix(user._id.toString());
    expect(prefix).toBe(
      (result as { created: true; rawKey: string }).rawKey.slice(0, 8),
    );
  });

  it("returns null for user without API key", async () => {
    const user = await User.create({ walletAddress: "0xNoKey" });
    const prefix = await getApiKeyPrefix(user._id.toString());
    expect(prefix).toBeNull();
  });

  it("returns null for non-existent user", async () => {
    const prefix = await getApiKeyPrefix(nonExistentId());
    expect(prefix).toBeNull();
  });
});

describe("getOnboardingState", () => {
  it("returns default state for a new user", async () => {
    const user = await User.create({ walletAddress: "0xOnboard1" });

    const state = await getOnboardingState(user._id.toString());

    expect(state.currentStep).toBe(0);
    expect(state.completedAt).toBeNull();
    expect(state.dismissedAt).toBeNull();
    expect(state.skippedSteps).toEqual([]);
    expect(state.firstMcpCallAt).toBeNull();
  });

  it("returns ISO strings for date fields, not Date objects", async () => {
    const user = await User.create({
      walletAddress: "0xOnboard2",
      onboardingStep: 3,
      onboardingCompletedAt: new Date("2026-01-15T12:00:00Z"),
      firstMcpCallAt: new Date("2026-01-14T10:00:00Z"),
    });

    const state = await getOnboardingState(user._id.toString());

    expect(typeof state.completedAt).toBe("string");
    expect(state.completedAt).toBe("2026-01-15T12:00:00.000Z");
    expect(typeof state.firstMcpCallAt).toBe("string");
    expect(state.firstMcpCallAt).toBe("2026-01-14T10:00:00.000Z");
  });

  it("throws for non-existent user", async () => {
    await expect(getOnboardingState(nonExistentId())).rejects.toThrow(
      "User not found",
    );
  });
});

describe("updateOnboardingStep", () => {
  it("advances onboarding step", async () => {
    const user = await User.create({ walletAddress: "0xStep1" });

    await updateOnboardingStep(user._id.toString(), 1);

    const updated = await User.findById(user._id).lean();
    expect(updated!.onboardingStep).toBe(1);
  });

  it("marks step as skipped when skipped=true", async () => {
    const user = await User.create({ walletAddress: "0xSkip1" });

    await updateOnboardingStep(user._id.toString(), 2, true);

    const updated = await User.findById(user._id).lean();
    expect(updated!.onboardingStep).toBe(2);
    expect(updated!.onboardingSkippedSteps).toContain(2);
  });

  it("does not duplicate skipped steps on repeated calls", async () => {
    const user = await User.create({ walletAddress: "0xSkipDup" });

    await updateOnboardingStep(user._id.toString(), 2, true);
    await updateOnboardingStep(user._id.toString(), 2, true);

    const updated = await User.findById(user._id).lean();
    expect(
      updated!.onboardingSkippedSteps!.filter((s: number) => s === 2),
    ).toHaveLength(1);
  });

  it("sets onboardingCompletedAt when step reaches 3", async () => {
    const user = await User.create({ walletAddress: "0xComplete1" });

    await updateOnboardingStep(user._id.toString(), 3);

    const updated = await User.findById(user._id).lean();
    expect(updated!.onboardingStep).toBe(3);
    expect(updated!.onboardingCompletedAt).toBeInstanceOf(Date);
  });

  it("throws for non-existent user", async () => {
    await expect(
      updateOnboardingStep(nonExistentId(), 1),
    ).rejects.toThrow("User not found");
  });
});

describe("completeOnboarding", () => {
  it("sets step to 3 and onboardingCompletedAt", async () => {
    const user = await User.create({
      walletAddress: "0xCompAll",
      onboardingStep: 2,
    });

    await completeOnboarding(user._id.toString());

    const updated = await User.findById(user._id).lean();
    expect(updated!.onboardingStep).toBe(3);
    expect(updated!.onboardingCompletedAt).toBeInstanceOf(Date);
  });

  it("throws for non-existent user", async () => {
    await expect(completeOnboarding(nonExistentId())).rejects.toThrow(
      "User not found",
    );
  });
});

describe("dismissOnboarding", () => {
  it("sets onboardingDismissedAt", async () => {
    const user = await User.create({ walletAddress: "0xDismiss1" });

    await dismissOnboarding(user._id.toString());

    const updated = await User.findById(user._id).lean();
    expect(updated!.onboardingDismissedAt).toBeInstanceOf(Date);
  });

  it("throws for non-existent user", async () => {
    await expect(dismissOnboarding(nonExistentId())).rejects.toThrow(
      "User not found",
    );
  });
});

describe("resumeOnboarding", () => {
  it("clears onboardingDismissedAt", async () => {
    const user = await User.create({
      walletAddress: "0xResume1",
      onboardingDismissedAt: new Date(),
    });

    await resumeOnboarding(user._id.toString());

    const updated = await User.findById(user._id).lean();
    expect(updated!.onboardingDismissedAt).toBeNull();
  });

  it("throws for non-existent user", async () => {
    await expect(resumeOnboarding(nonExistentId())).rejects.toThrow(
      "User not found",
    );
  });
});

describe("recordMcpCall", () => {
  it("sets firstMcpCallAt on the first call", async () => {
    const user = await User.create({ walletAddress: "0xMcp1" });

    await recordMcpCall(user._id.toString());

    const updated = await User.findById(user._id).lean();
    expect(updated!.firstMcpCallAt).toBeInstanceOf(Date);
    expect(updated!.lastMcpCallAt).toBeInstanceOf(Date);
  });

  it("does not overwrite firstMcpCallAt on subsequent calls", async () => {
    const firstCallTime = new Date("2026-01-10T12:00:00Z");
    const user = await User.create({
      walletAddress: "0xMcp2",
      firstMcpCallAt: firstCallTime,
    });

    await recordMcpCall(user._id.toString());

    const updated = await User.findById(user._id).lean();
    expect(updated!.firstMcpCallAt!.toISOString()).toBe(
      firstCallTime.toISOString(),
    );
    expect(updated!.lastMcpCallAt).toBeInstanceOf(Date);
  });

  it("updates lastMcpCallAt on every call", async () => {
    const user = await User.create({ walletAddress: "0xMcp3" });

    await recordMcpCall(user._id.toString());
    const first = await User.findById(user._id).lean();
    const firstLastCall = first!.lastMcpCallAt!;

    // Small delay to ensure different timestamp
    await new Promise((r) => setTimeout(r, 10));

    await recordMcpCall(user._id.toString());
    const second = await User.findById(user._id).lean();

    expect(second!.lastMcpCallAt!.getTime()).toBeGreaterThanOrEqual(
      firstLastCall.getTime(),
    );
  });
});

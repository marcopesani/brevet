import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetTestDb, seedTestUser } from "../../test/helpers/db";
import { createTestEndpointPolicy } from "../../test/helpers/fixtures";
import { User } from "../models/user";
import { EndpointPolicy } from "../models/endpoint-policy";
import { checkPolicy } from "../policy";
import mongoose from "mongoose";

describe("checkPolicy", () => {
  let userId: string;

  beforeEach(async () => {
    await resetTestDb();
    const { user } = await seedTestUser();
    userId = user.id;
  });

  afterEach(async () => {
    vi.useRealTimers();
    await resetTestDb();
  });

  it("returns auto_sign when autoSign is true", async () => {
    const result = await checkPolicy(0.05, "https://api.example.com/resource", userId);

    expect(result.action).toBe("auto_sign");
    expect(result.autoSign).toBe(true);
  });

  it("rejects when no matching endpoint policy exists", async () => {
    // Create a user with no policy
    const noPolicy = await User.create({
      _id: new mongoose.Types.ObjectId(),
      email: "no-policy@example.com",
    });

    const result = await checkPolicy(0.01, "https://unknown.example.com/resource", noPolicy.id);

    expect(result.action).toBe("rejected");
    expect(result.reason).toContain("No active policy");
  });

  describe("no policy — draft auto-creation", () => {
    it("auto-creates a draft policy for the endpoint origin", async () => {
      const result = await checkPolicy(0.01, "https://unknown.example.com/resource", userId);

      expect(result.action).toBe("rejected");
      expect(result.reason).toContain("draft policy has been created");

      const draft = await EndpointPolicy.findOne({
        userId: new mongoose.Types.ObjectId(userId),
        endpointPattern: "https://unknown.example.com",
      }).lean();
      expect(draft).not.toBeNull();
      expect(draft!.status).toBe("draft");
    });

    it("does not duplicate draft if one already exists", async () => {
      await checkPolicy(0.01, "https://unknown.example.com/a", userId);
      await checkPolicy(0.01, "https://unknown.example.com/b", userId);

      const drafts = await EndpointPolicy.find({
        userId: new mongoose.Types.ObjectId(userId),
        endpointPattern: "https://unknown.example.com",
      }).lean();
      expect(drafts).toHaveLength(1);
    });

    it("reactivates an archived policy as draft instead of creating a duplicate", async () => {
      // Archive the seeded policy for api.example.com
      await EndpointPolicy.findOneAndUpdate(
        { userId: new mongoose.Types.ObjectId(userId), endpointPattern: "https://api.example.com" },
        { $set: { status: "archived", archivedAt: new Date() } },
      );

      const result = await checkPolicy(0.01, "https://api.example.com/resource", userId);

      expect(result.action).toBe("rejected");
      expect(result.reason).toContain("draft policy has been created");

      const policy = await EndpointPolicy.findOne({
        userId: new mongoose.Types.ObjectId(userId),
        endpointPattern: "https://api.example.com",
      }).lean();
      expect(policy).not.toBeNull();
      expect(policy!.status).toBe("draft");
      expect(policy!.archivedAt).toBeNull();
    });

    it("does not match draft policies", async () => {
      await EndpointPolicy.create(
        createTestEndpointPolicy(userId, {
          endpointPattern: "https://draft.example.com",
          status: "draft",
        }),
      );

      const result = await checkPolicy(0.01, "https://draft.example.com/resource", userId);

      expect(result.action).toBe("rejected");
      expect(result.reason).toContain("No active policy");
    });
  });

  describe("prefix matching", () => {
    it("matches endpoints by longest prefix", async () => {
      // The seeded policy has endpointPattern "https://api.example.com"
      // A request to a sub-path should match
      const result = await checkPolicy(0.05, "https://api.example.com/some/deep/path", userId);

      expect(result.action).toBe("auto_sign");
    });

    it("prefers the longest matching prefix", async () => {
      // Create a more specific policy with autoSign=false
      await EndpointPolicy.create(
        createTestEndpointPolicy(userId, {
          endpointPattern: "https://api.example.com/expensive",
          autoSign: false,
        }),
      );

      const result = await checkPolicy(0.5, "https://api.example.com/expensive/item", userId);

      // Should match the more specific policy (autoSign=false)
      expect(result.action).toBe("manual_approval");
      expect(result.autoSign).toBe(false);
    });

    it("rejects endpoints that don't match any policy prefix", async () => {
      const result = await checkPolicy(0.05, "https://other.example.com/resource", userId);

      expect(result.action).toBe("rejected");
      expect(result.reason).toContain("No active policy");
    });

    it("does not match across domain boundaries (M11)", async () => {
      // Pattern "https://api.example.com" should NOT match "https://api.example.com.evil.com"
      const result = await checkPolicy(0.05, "https://api.example.com.evil.com/resource", userId);

      expect(result.action).toBe("rejected");
      expect(result.reason).toContain("No active policy");
    });

    it("does not match when next char is not a URL boundary (M11)", async () => {
      // Pattern "https://api.example.com" should NOT match "https://api.example.com-evil.com"
      const result = await checkPolicy(0.05, "https://api.example.com-evil.com/resource", userId);

      expect(result.action).toBe("rejected");
      expect(result.reason).toContain("No active policy");
    });

    it("matches when next char is a query parameter boundary (M11)", async () => {
      const result = await checkPolicy(0.05, "https://api.example.com?query=1", userId);

      expect(result.action).toBe("auto_sign");
    });

    it("matches when next char is a fragment boundary (M11)", async () => {
      const result = await checkPolicy(0.05, "https://api.example.com#section", userId);

      expect(result.action).toBe("auto_sign");
    });

    it("matches exact endpoint pattern with no trailing path (M11)", async () => {
      const result = await checkPolicy(0.05, "https://api.example.com", userId);

      expect(result.action).toBe("auto_sign");
    });

    it("matches when pattern ends with trailing slash (M11)", async () => {
      // Create a policy with trailing slash
      await EndpointPolicy.create(
        createTestEndpointPolicy(userId, {
          endpointPattern: "https://trailing.example.com/",
        }),
      );

      const result = await checkPolicy(0.05, "https://trailing.example.com/resource", userId);

      expect(result.action).toBe("auto_sign");
    });

    it("still matches without trailing slash in pattern (M11)", async () => {
      // The seeded policy has pattern "https://api.example.com" (no trailing slash)
      const result = await checkPolicy(0.05, "https://api.example.com/resource", userId);

      expect(result.action).toBe("auto_sign");
    });

    it("still rejects cross-domain matches with trailing-slash pattern (M11)", async () => {
      // Pattern "https://api.example.com" should NOT match "https://api.example.com-evil.com"
      // (existing behavior preserved)
      const result = await checkPolicy(0.05, "https://api.example.com-evil.com", userId);

      expect(result.action).toBe("rejected");
    });
  });

  it("ignores archived policies (treats as if no policy exists)", async () => {
    // Archive the seeded policy
    await EndpointPolicy.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(userId), endpointPattern: "https://api.example.com" },
      { $set: { status: "archived", archivedAt: new Date() } },
    );

    const result = await checkPolicy(0.05, "https://api.example.com/resource", userId);

    expect(result.action).toBe("rejected");
    expect(result.reason).toContain("No active policy");
  });

  describe("autoSign flag", () => {
    it("returns manual_approval when autoSign is false", async () => {
      await EndpointPolicy.findOneAndUpdate(
        { userId: new mongoose.Types.ObjectId(userId), endpointPattern: "https://api.example.com" },
        { $set: { autoSign: false } },
      );

      const result = await checkPolicy(0.01, "https://api.example.com/resource", userId);

      expect(result.action).toBe("manual_approval");
    });

    it("returns auto_sign when autoSign is true", async () => {
      const result = await checkPolicy(0.01, "https://api.example.com/resource", userId);

      expect(result.action).toBe("auto_sign");
    });
  });

  describe("chain-aware policy matching", () => {
    it("does not match a policy from a different chain", async () => {
      // The seeded policy has the default chainId (8453).
      // Querying with a different chainId should not find it.
      const result = await checkPolicy(0.05, "https://api.example.com/resource", userId, 42161);

      expect(result.action).toBe("rejected");
      expect(result.reason).toContain("No active policy");
    });

    it("creates a draft policy with the specified chainId", async () => {
      const result = await checkPolicy(0.01, "https://unknown-chain.example.com/resource", userId, 42161);

      expect(result.action).toBe("rejected");

      const draft = await EndpointPolicy.findOne({
        userId: new mongoose.Types.ObjectId(userId),
        endpointPattern: "https://unknown-chain.example.com",
        chainId: 42161,
      }).lean();
      expect(draft).not.toBeNull();
      expect(draft!.status).toBe("draft");
      expect(draft!.chainId).toBe(42161);
    });

    it("matches a policy on the correct chain", async () => {
      // Create a policy specifically for Arbitrum (42161)
      await EndpointPolicy.create(
        createTestEndpointPolicy(userId, {
          endpointPattern: "https://arb-api.example.com",
          chainId: 42161,
        }),
      );

      const result = await checkPolicy(0.05, "https://arb-api.example.com/resource", userId, 42161);

      expect(result.action).toBe("auto_sign");
    });

    it("allows same endpoint pattern on different chains", async () => {
      // Create a policy for the same endpoint on Arbitrum
      await EndpointPolicy.create(
        createTestEndpointPolicy(userId, {
          endpointPattern: "https://api.example.com",
          autoSign: false,
          chainId: 42161,
        }),
      );

      // Default chain should still match auto_sign
      const baseResult = await checkPolicy(0.05, "https://api.example.com/resource", userId);
      expect(baseResult.action).toBe("auto_sign");

      // Arbitrum chain should match manual_approval
      const arbResult = await checkPolicy(0.05, "https://api.example.com/resource", userId, 42161);
      expect(arbResult.action).toBe("manual_approval");
    });
  });
});

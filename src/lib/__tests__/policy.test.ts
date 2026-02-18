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

  it("returns hot_wallet when payFromHotWallet is true", async () => {
    const result = await checkPolicy(0.05, "https://api.example.com/resource", userId);

    expect(result.action).toBe("hot_wallet");
    expect(result.payFromHotWallet).toBe(true);
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

      expect(result.action).toBe("hot_wallet");
    });

    it("prefers the longest matching prefix", async () => {
      // Create a more specific policy with payFromHotWallet=false
      await EndpointPolicy.create(
        createTestEndpointPolicy(userId, {
          endpointPattern: "https://api.example.com/expensive",
          payFromHotWallet: false,
        }),
      );

      const result = await checkPolicy(0.5, "https://api.example.com/expensive/item", userId);

      // Should match the more specific policy (payFromHotWallet=false)
      expect(result.action).toBe("walletconnect");
      expect(result.payFromHotWallet).toBe(false);
    });

    it("rejects endpoints that don't match any policy prefix", async () => {
      const result = await checkPolicy(0.05, "https://other.example.com/resource", userId);

      expect(result.action).toBe("rejected");
      expect(result.reason).toContain("No active policy");
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

  describe("payFromHotWallet flag", () => {
    it("returns walletconnect when payFromHotWallet is false", async () => {
      await EndpointPolicy.findOneAndUpdate(
        { userId: new mongoose.Types.ObjectId(userId), endpointPattern: "https://api.example.com" },
        { $set: { payFromHotWallet: false } },
      );

      const result = await checkPolicy(0.01, "https://api.example.com/resource", userId);

      expect(result.action).toBe("walletconnect");
    });

    it("returns hot_wallet when payFromHotWallet is true", async () => {
      const result = await checkPolicy(0.01, "https://api.example.com/resource", userId);

      expect(result.action).toBe("hot_wallet");
    });
  });
});

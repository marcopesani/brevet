import mongoose from "mongoose";
import { User } from "@/lib/models/user";
import { HotWallet } from "@/lib/models/hot-wallet";
import { EndpointPolicy } from "@/lib/models/endpoint-policy";
import {
  createTestUser,
  createTestHotWallet,
  createTestEndpointPolicy,
} from "./fixtures";

/**
 * Clear all collections in the test database.
 * Safe to call between tests for isolation.
 */
export async function resetTestDb(): Promise<void> {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
}

/**
 * Seed a test user with associated hot wallet and endpoint policy.
 * Returns all created records.
 */
export async function seedTestUser(
  overrides?: Parameters<typeof createTestUser>[0],
) {
  const userData = createTestUser(overrides);
  const user = await User.create(userData);

  const hotWalletData = createTestHotWallet(user.id);
  const hotWallet = await HotWallet.create(hotWalletData);

  const policyData = createTestEndpointPolicy(user.id);
  const policy = await EndpointPolicy.create(policyData);

  return { user, hotWallet, policy };
}

/**
 * Disconnect from the test database.
 */
export async function cleanupTestDb(): Promise<void> {
  await mongoose.disconnect();
}

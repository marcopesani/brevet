import { prisma } from "@/lib/db";
import { createTestUser, createTestHotWallet, createTestPolicy } from "./fixtures";

/**
 * Truncate all tables in the test database.
 * Order matters due to foreign key constraints.
 */
export async function resetTestDb(): Promise<void> {
  await prisma.pendingPayment.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.spendingPolicy.deleteMany();
  await prisma.hotWallet.deleteMany();
  await prisma.user.deleteMany();
}

/**
 * Seed a test user with associated hot wallet and spending policy.
 * Returns all created records.
 */
export async function seedTestUser(
  overrides?: Parameters<typeof createTestUser>[0],
) {
  const userData = createTestUser(overrides);
  const user = await prisma.user.create({ data: userData });

  const hotWalletData = createTestHotWallet(user.id);
  const hotWallet = await prisma.hotWallet.create({ data: hotWalletData });

  const policyData = createTestPolicy(user.id);
  const policy = await prisma.spendingPolicy.create({ data: policyData });

  return { user, hotWallet, policy };
}

/**
 * Delete the test database file. Call in globalTeardown if needed.
 */
export async function cleanupTestDb(): Promise<void> {
  await prisma.$disconnect();
}

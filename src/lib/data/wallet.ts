import { prisma } from "@/lib/db";
import { createHotWallet as createHotWalletKeys, getUsdcBalance, withdrawFromHotWallet as withdrawHotWallet } from "@/lib/hot-wallet";

/**
 * Get the user's hot wallet balance and address.
 * Returns null if the user has no hot wallet.
 */
export async function getWalletBalance(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { hotWallet: true },
  });

  if (!user?.hotWallet) {
    return null;
  }

  const balance = await getUsdcBalance(user.hotWallet.address);
  return { balance, address: user.hotWallet.address };
}

/**
 * Ensure a hot wallet exists for the user. Creates one if needed.
 * Returns the wallet address and userId.
 */
export async function ensureHotWallet(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { hotWallet: true },
  });

  if (!user) {
    return null;
  }

  if (user.hotWallet) {
    return { address: user.hotWallet.address, userId: user.id };
  }

  const { address, encryptedPrivateKey } = createHotWalletKeys();

  await prisma.hotWallet.create({
    data: {
      address,
      encryptedPrivateKey,
      userId: user.id,
    },
  });

  return { address, userId: user.id };
}

/**
 * Withdraw USDC from the user's hot wallet to a destination address.
 */
export async function withdrawFromWallet(
  userId: string,
  amount: number,
  toAddress: string,
) {
  return withdrawHotWallet(userId, amount, toAddress);
}

/**
 * Get the user's hot wallet record (used by payment.ts for private key access).
 * Returns null if not found.
 */
export async function getHotWallet(userId: string) {
  return prisma.hotWallet.findUnique({
    where: { userId },
  });
}

/**
 * Get user with hot wallet and endpoint policies (used by MCP check_balance tool).
 */
export async function getUserWithWalletAndPolicies(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: { hotWallet: true, endpointPolicies: true },
  });
}

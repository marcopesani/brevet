import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";

export async function getAuthenticatedUser(): Promise<{
  userId: string;
  walletAddress: string;
} | null> {
  const session = await getServerSession(authOptions);
  if (!session?.userId || !session?.address) return null;
  return {
    userId: session.userId,
    walletAddress: session.address,
  };
}

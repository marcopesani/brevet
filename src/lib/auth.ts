import { getServerSession } from "next-auth";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import {
  verifySignature,
  getChainIdFromMessage,
  getAddressFromMessage,
} from "@reown/appkit-siwe";
import type { SIWESession } from "@reown/appkit-siwe";
import { prisma } from "@/lib/db";
import { createHotWallet } from "@/lib/hot-wallet";

declare module "next-auth" {
  interface Session extends SIWESession {
    address: string;
    chainId: number;
  }
}

const nextAuthSecret = process.env.NEXTAUTH_SECRET;
if (!nextAuthSecret) throw new Error("NEXTAUTH_SECRET is not set");

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
if (!projectId)
  throw new Error("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set");

export const authOptions: NextAuthOptions = {
  secret: nextAuthSecret,
  providers: [
    CredentialsProvider({
      name: "Ethereum",
      credentials: {
        message: { label: "Message", type: "text", placeholder: "0x0" },
        signature: { label: "Signature", type: "text", placeholder: "0x0" },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.message) throw new Error("SiweMessage is undefined");
          const { message, signature } = credentials;
          const address = getAddressFromMessage(message);
          const chainId = getChainIdFromMessage(message);

          const isValid = await verifySignature({
            address,
            message,
            signature,
            chainId,
            projectId: projectId!,
          });

          if (!isValid) return null;

          // Upsert user + hot wallet (same logic as old verify route)
          const walletAddress = address.toLowerCase();
          let user = await prisma.user.findUnique({
            where: { walletAddress },
            include: { hotWallet: true },
          });

          if (!user) {
            const { address: hwAddress, encryptedPrivateKey } = createHotWallet();
            user = await prisma.user.create({
              data: {
                walletAddress,
                hotWallet: {
                  create: { address: hwAddress, encryptedPrivateKey },
                },
              },
              include: { hotWallet: true },
            });
          }

          return { id: `${chainId}:${address}` };
        } catch {
          return null;
        }
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    session({ session, token }) {
      if (!token.sub) return session;
      const [chainId, address] = token.sub.split(":");
      if (chainId && address) {
        session.address = address;
        session.chainId = parseInt(chainId, 10);
      }
      return session;
    },
  },
};

export async function getAuthenticatedUser(): Promise<{
  userId: string;
  walletAddress: string;
} | null> {
  const session = await getServerSession(authOptions);
  if (!session?.address) return null;

  const walletAddress = session.address.toLowerCase();
  const user = await prisma.user.findUnique({ where: { walletAddress } });
  if (!user) return null;

  return { userId: user.id, walletAddress: user.walletAddress ?? walletAddress };
}

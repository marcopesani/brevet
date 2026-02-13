import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import {
  getAddressFromMessage,
  getChainIdFromMessage,
} from "@reown/appkit-siwe";
import { createPublicClient, http } from "viem";
import { prisma } from "@/lib/db";
import { createHotWallet } from "@/lib/hot-wallet";

declare module "next-auth" {
  interface User {
    address: string;
    chainId: number;
  }

  interface Session {
    address: string;
    chainId: number;
    userId: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    address: string;
    chainId: number;
    userId: string;
  }
}

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!;

/** Validate and extract message + signature from credentials. */
export function extractCredentials(credentials: Record<string, string> | undefined): {
  message: string;
  signature: string;
} {
  const message = credentials?.message;
  const signature = credentials?.signature;
  if (!message || !signature) {
    throw new Error("Missing message or signature");
  }
  return { message, signature };
}

/** Verify a SIWE signature using viem's public client. */
export async function verifySignature(
  message: string,
  address: string,
  signature: string,
  chainId: string,
): Promise<boolean> {
  const publicClient = createPublicClient({
    transport: http(
      `https://rpc.walletconnect.org/v1/?chainId=${chainId}&projectId=${projectId}`,
    ),
  });

  return publicClient.verifyMessage({
    message,
    address: address as `0x${string}`,
    signature: signature as `0x${string}`,
  });
}

/** Find or create a user by wallet address, creating a hot wallet for new users. */
export async function upsertUser(walletAddress: string) {
  let user = await prisma.user.findUnique({
    where: { walletAddress },
    include: { hotWallet: true },
  });

  if (!user) {
    const { address, encryptedPrivateKey } = createHotWallet();

    user = await prisma.user.create({
      data: {
        walletAddress,
        hotWallet: {
          create: {
            address,
            encryptedPrivateKey,
          },
        },
      },
      include: { hotWallet: true },
    });
  }

  return user;
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: "Ethereum",
      credentials: {
        message: { label: "Message", type: "text" },
        signature: { label: "Signature", type: "text" },
      },
      async authorize(credentials) {
        const { message, signature } = extractCredentials(credentials);

        const address = getAddressFromMessage(message);
        const chainId = getChainIdFromMessage(message);

        const isValid = await verifySignature(message, address, signature, chainId);
        if (!isValid) return null;

        const walletAddress = address.toLowerCase();
        const user = await upsertUser(walletAddress);

        // getChainIdFromMessage returns CAIP-2 format "eip155:8453"; extract the numeric part
        const numericChainId = parseInt(chainId.split(":").pop() || chainId, 10);
        const result = {
          id: user.id,
          address: walletAddress,
          chainId: numericChainId,
        };
        return result;
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.address = user.address;
        token.chainId = user.chainId;
      }
      return token;
    },
    session({ session, token }) {
      session.userId = token.userId;
      session.address = token.address;
      session.chainId = token.chainId;
      return session;
    },
  },
};

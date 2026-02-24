import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import {
  getAddressFromMessage,
  getChainIdFromMessage,
} from "@reown/appkit-siwe";
import { createPublicClient, http, verifyMessage as verifyMessageLocally } from "viem";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/user";
import { ensureApiKey } from "@/lib/data/users";
import { getTestnetChains, getMainnetChains } from "@/lib/chain-config";

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

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
if (!projectId || projectId.trim() === "")
  throw new Error("Missing required env var: NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID");

const authSecret = process.env.NEXTAUTH_SECRET;
if (!authSecret || authSecret.trim() === "")
  throw new Error("Missing required env var: NEXTAUTH_SECRET");

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
  if (process.env.NEXT_PUBLIC_TEST_MODE === "true") {
    return verifyMessageLocally({
      message,
      address: address as `0x${string}`,
      signature: signature as `0x${string}`,
    });
  }

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

/** Compute the default enabledChains for a new user. */
export function getDefaultEnabledChains(): number[] {
  const testnetIds = getTestnetChains().map((c) => c.chain.id);
  const mainnetEnabled = process.env.DEFAULT_MAINNET_CHAINS_ENABLED === "true";
  if (mainnetEnabled) {
    const mainnetIds = getMainnetChains().map((c) => c.chain.id);
    return [...testnetIds, ...mainnetIds];
  }
  return testnetIds;
}

/** Find or create a user by wallet address. */
export async function upsertUser(walletAddress: string) {
  await connectDB();

  let user = await User.findOne({ walletAddress });

  if (!user) {
    const enabledChains = getDefaultEnabledChains();
    user = await User.create({ walletAddress, enabledChains });
  } else if (!user.enabledChains || user.enabledChains.length === 0) {
    user.enabledChains = getDefaultEnabledChains();
    await user.save();
  }

  await ensureApiKey(user.id);

  return user;
}

export const authOptions: NextAuthOptions = {
  secret: authSecret,
  pages: {
    signIn: "/login",
  },
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

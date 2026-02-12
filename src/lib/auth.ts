import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import crypto from "crypto";

const SESSION_COOKIE = "session";
const NONCE_COOKIE = "siwe_nonce";
const JWT_EXPIRY = "7d";

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

export function generateNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

export async function createSession(
  userId: string,
  walletAddress: string,
): Promise<void> {
  const secret = getJwtSecret();
  const token = await new SignJWT({ userId, walletAddress })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(secret);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });
}

export async function getAuthenticatedUser(): Promise<{
  userId: string;
  walletAddress: string;
} | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret);
    const userId = payload.userId as string | undefined;
    const walletAddress = payload.walletAddress as string | undefined;
    if (!userId || !walletAddress) return null;
    return { userId, walletAddress };
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function setNonceCookie(nonce: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // strict can prevent cookie being sent after wallet redirects
    path: "/",
    maxAge: 5 * 60, // 5 minutes
  });
}

export async function consumeNonceCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  const nonce = cookieStore.get(NONCE_COOKIE)?.value ?? null;
  if (nonce) {
    cookieStore.delete(NONCE_COOKIE);
  }
  return nonce;
}

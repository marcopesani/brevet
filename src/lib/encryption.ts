import {
  formatUnits,
} from "viem";
import crypto from "crypto";
import { createChainPublicClient, getChainById, getUsdcConfig } from "@/lib/chain-config";
import { reportRpcError, reportRpcSuccess } from "@/lib/rpc-health";

const USDC_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

function getEncryptionKey(): Buffer {
  const key = process.env.HOT_WALLET_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("HOT_WALLET_ENCRYPTION_KEY is not set");
  }
  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(
      "HOT_WALLET_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)",
    );
  }
  return Buffer.from(key, "hex");
}

export function encryptPrivateKey(privateKey: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(privateKey, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  // Store as iv:authTag:encrypted (all hex)
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptPrivateKey(encryptedData: string): string {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, encryptedHex] = encryptedData.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

function resolveChainConfig(chainId: number) {
  const config = getChainById(chainId);
  if (!config) {
    throw new Error(`Unsupported chain: ${chainId}`);
  }
  return config;
}

/**
 * Returns true if the error is from the RPC returning 429 (over rate limit).
 * Kept for backward-compatibility; prefer isRateLimitError from rpc-health.
 */
export function isRpcRateLimitError(error: unknown): boolean {
  let e: unknown = error;
  while (e) {
    const err = e as { status?: number; message?: string; cause?: unknown };
    if (err.status === 429 || (err.message && err.message.includes("over rate limit"))) {
      return true;
    }
    e = err.cause;
  }
  return false;
}

export async function getUsdcBalance(
  address: string,
  chainId: number,
): Promise<string> {
  const config = resolveChainConfig(chainId);
  const resolvedChainId = config.chain.id;
  const client = createChainPublicClient(resolvedChainId);
  const usdcToken = getUsdcConfig(resolvedChainId);
  const decimals = usdcToken?.decimals ?? 6;
  try {
    const balance = await client.readContract({
      address: config.usdcAddress,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [address as `0x${string}`],
    });
    reportRpcSuccess(resolvedChainId);
    return formatUnits(balance, decimals);
  } catch (error) {
    reportRpcError(resolvedChainId, error);
    throw error;
  }
}

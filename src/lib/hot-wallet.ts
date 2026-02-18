import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  createPublicClient,
  createWalletClient,
  http,
  formatUnits,
  parseUnits,
  isAddress,
} from "viem";
import crypto from "crypto";
import { connectDB } from "@/lib/db";
import { HotWallet as HotWalletModel } from "@/lib/models/hot-wallet";
import { createTransaction } from "@/lib/data/transactions";
import { Types } from "mongoose";
import { getChainConfig, getDefaultChainConfig } from "@/lib/chain-config";

const DEFAULT_CHAIN_ID = parseInt(
  process.env.NEXT_PUBLIC_CHAIN_ID || "8453",
  10,
);

const USDC_ADDRESS = getDefaultChainConfig().usdcAddress;
const USDC_DECIMALS = 6;

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

export function createHotWallet(): {
  address: string;
  encryptedPrivateKey: string;
} {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const encryptedPrivateKey = encryptPrivateKey(privateKey);
  return {
    address: account.address,
    encryptedPrivateKey,
  };
}

function resolveChainConfig(chainId?: number) {
  const id = chainId ?? DEFAULT_CHAIN_ID;
  const config = getChainConfig(id);
  if (!config) {
    throw new Error(`Unsupported chain: ${id}`);
  }
  return config;
}

function getPublicClient(chainId?: number) {
  const config = resolveChainConfig(chainId);
  return createPublicClient({
    chain: config.chain,
    transport: http(),
  });
}

/**
 * Returns true if the error is from the RPC returning 429 (over rate limit).
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
  chainId?: number,
): Promise<string> {
  const config = resolveChainConfig(chainId);
  const client = getPublicClient(chainId);
  const balance = await client.readContract({
    address: config.usdcAddress,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: [address as `0x${string}`],
  });
  return formatUnits(balance, USDC_DECIMALS);
}

export async function withdrawFromHotWallet(
  userId: string,
  amount: number,
  toAddress: string,
  chainId?: number,
): Promise<{ txHash: string }> {
  if (!isAddress(toAddress)) {
    throw new Error("Invalid destination address");
  }
  if (amount <= 0) {
    throw new Error("Amount must be greater than 0");
  }

  const resolvedChainId = chainId ?? DEFAULT_CHAIN_ID;
  const config = resolveChainConfig(resolvedChainId);

  await connectDB();

  // Look up the user's hot wallet for this chain
  const hotWallet = await HotWalletModel.findOne({
    userId: new Types.ObjectId(userId),
    chainId: resolvedChainId,
  });
  if (!hotWallet) {
    throw new Error("No hot wallet found for this user");
  }

  // Check balance on the specific chain
  const balance = await getUsdcBalance(hotWallet.address, resolvedChainId);
  if (parseFloat(balance) < amount) {
    throw new Error(
      `Insufficient balance: ${balance} USDC available, ${amount} requested`,
    );
  }

  // Decrypt private key and create wallet client
  const privateKey = decryptPrivateKey(hotWallet.encryptedPrivateKey);
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain: config.chain,
    transport: http(),
  });

  // Submit ERC-20 transfer
  const txHash = await walletClient.writeContract({
    address: config.usdcAddress,
    abi: USDC_ABI,
    functionName: "transfer",
    args: [toAddress as `0x${string}`, parseUnits(String(amount), USDC_DECIMALS)],
  });

  // Log withdrawal transaction via data layer
  await createTransaction({
    amount,
    endpoint: `withdrawal:${toAddress}`,
    txHash,
    network: config.networkString,
    chainId: resolvedChainId,
    status: "completed",
    type: "withdrawal",
    userId,
  });

  return { txHash };
}

export { USDC_ADDRESS, USDC_DECIMALS };

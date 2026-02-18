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
import { Transaction } from "@/lib/models/transaction";
import { Types } from "mongoose";
import { chainConfig } from "@/lib/chain-config";

const USDC_ADDRESS = chainConfig.usdcAddress;
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
  // Expect a 64-char hex string (32 bytes)
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

function getPublicClient() {
  const rpcUrl = process.env.RPC_URL;
  return createPublicClient({
    chain: chainConfig.chain,
    transport: http(rpcUrl),
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

export async function getUsdcBalance(address: string): Promise<string> {
  const client = getPublicClient();
  const balance = await client.readContract({
    address: USDC_ADDRESS,
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
): Promise<{ txHash: string }> {
  if (!isAddress(toAddress)) {
    throw new Error("Invalid destination address");
  }
  if (amount <= 0) {
    throw new Error("Amount must be greater than 0");
  }

  await connectDB();

  // Look up the user's hot wallet
  const hotWallet = await HotWalletModel.findOne({
    userId: new Types.ObjectId(userId),
  });
  if (!hotWallet) {
    throw new Error("No hot wallet found for this user");
  }

  // Check balance
  const balance = await getUsdcBalance(hotWallet.address);
  if (parseFloat(balance) < amount) {
    throw new Error(
      `Insufficient balance: ${balance} USDC available, ${amount} requested`,
    );
  }

  // Decrypt private key and create wallet client
  const privateKey = decryptPrivateKey(hotWallet.encryptedPrivateKey);
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const rpcUrl = process.env.RPC_URL;
  const walletClient = createWalletClient({
    account,
    chain: chainConfig.chain,
    transport: http(rpcUrl),
  });

  // Submit ERC-20 transfer
  const txHash = await walletClient.writeContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "transfer",
    args: [toAddress as `0x${string}`, parseUnits(String(amount), USDC_DECIMALS)],
  });

  // Log withdrawal transaction
  await Transaction.create({
    amount,
    endpoint: `withdrawal:${toAddress}`,
    txHash,
    network: chainConfig.chain.name.toLowerCase(),
    status: "completed",
    type: "withdrawal",
    userId: new Types.ObjectId(userId),
  });

  return { txHash };
}

export { USDC_ADDRESS, USDC_DECIMALS };

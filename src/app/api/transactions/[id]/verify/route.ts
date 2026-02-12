import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import type { Hex } from "viem";
import { prisma } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { chainConfig } from "@/lib/chain-config";

const publicClient = createPublicClient({
  chain: chainConfig.chain,
  transport: http(),
});

/**
 * POST /api/transactions/[id]/verify
 * Verify a transaction on-chain by looking up its receipt on Base.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = rateLimit(getClientIp(request), 10);
  if (limited) return limited;

  const { id } = await params;

  const transaction = await prisma.transaction.findUnique({
    where: { id },
  });

  if (!transaction) {
    return NextResponse.json(
      { error: "Transaction not found" },
      { status: 404 },
    );
  }

  if (!transaction.txHash) {
    return NextResponse.json(
      { error: "Transaction has no on-chain hash" },
      { status: 400 },
    );
  }

  try {
    const receipt = await publicClient.getTransactionReceipt({
      hash: transaction.txHash as Hex,
    });

    const latestBlock = await publicClient.getBlockNumber();
    const confirmations = Number(latestBlock - receipt.blockNumber);

    return NextResponse.json({
      verified: receipt.status === "success",
      blockNumber: Number(receipt.blockNumber),
      confirmations,
      status: receipt.status,
    });
  } catch {
    return NextResponse.json({
      verified: false,
      error: "Transaction receipt not found on-chain",
    });
  }
}

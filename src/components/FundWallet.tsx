"use client";

import { useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const USDC_DECIMALS = 6;

const ERC20_ABI = [
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

export default function FundWallet({
  hotWalletAddress,
  onFunded,
}: {
  hotWalletAddress: string;
  onFunded?: () => void;
}) {
  const [amount, setAmount] = useState("");

  const { writeContract, data: txHash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  function handleFund() {
    if (!amount || parseFloat(amount) <= 0) return;

    writeContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [
        hotWalletAddress as `0x${string}`,
        parseUnits(amount, USDC_DECIMALS),
      ],
    });
  }

  if (isSuccess) {
    onFunded?.();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          type="number"
          placeholder="USDC amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min="0"
          step="0.01"
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <button
          onClick={handleFund}
          disabled={isPending || isConfirming || !amount}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending
            ? "Confirm in wallet..."
            : isConfirming
              ? "Confirming..."
              : "Fund"}
        </button>
      </div>
      {error && (
        <p className="text-xs text-red-500">
          {error.message.length > 100
            ? error.message.slice(0, 100) + "..."
            : error.message}
        </p>
      )}
      {isSuccess && (
        <p className="text-xs text-green-600">
          Funded successfully!
        </p>
      )}
    </div>
  );
}

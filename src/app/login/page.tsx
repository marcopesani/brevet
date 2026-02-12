"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAppKit } from "@reown/appkit/react";
import { useAccount } from "wagmi";
import { useSIWE } from "@/hooks/useSIWE";

export default function LoginPage() {
  const router = useRouter();
  const { open } = useAppKit();
  const { address, isConnected, chainId } = useAccount();
  const { authenticate, status, error, reset } = useSIWE();
  const authStartedRef = useRef(false);

  // When wallet connects, automatically trigger SIWE once (avoids double nonce fetch)
  useEffect(() => {
    if (!isConnected || !address || !chainId || status !== "idle") return;
    if (authStartedRef.current) return;
    authStartedRef.current = true;
    authenticate(address, chainId).then((success) => {
      if (success) {
        router.push("/dashboard");
      } else {
        authStartedRef.current = false; // allow retry after error
      }
    });
  }, [isConnected, address, chainId, status, authenticate, router]);

  const handleConnect = () => {
    authStartedRef.current = false;
    reset();
    open();
  };

  const isLoading = status === "fetching-nonce" || status === "signing" || status === "verifying";

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 px-6">
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          PayMCP
        </h1>
        <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
          Connect your wallet to sign in or create an account.
        </p>

        <button
          onClick={handleConnect}
          disabled={isLoading}
          className="w-full rounded-lg bg-black px-5 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
        >
          {isLoading ? statusLabel(status) : "Connect Wallet"}
        </button>

        {error && (
          <p className="text-center text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case "fetching-nonce":
      return "Preparing...";
    case "signing":
      return "Sign the message in your wallet...";
    case "verifying":
      return "Verifying...";
    default:
      return "Connect Wallet";
  }
}

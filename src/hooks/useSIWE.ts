"use client";

import { useState, useCallback } from "react";
import { useSignMessage } from "wagmi";
import { SiweMessage } from "siwe";

type SIWEStatus = "idle" | "fetching-nonce" | "signing" | "verifying" | "success" | "error";

export function useSIWE() {
  const [status, setStatus] = useState<SIWEStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const { signMessageAsync } = useSignMessage();

  const authenticate = useCallback(
    async (address: string, chainId: number) => {
      setError(null);

      try {
        // 1. Fetch nonce (credentials so siwe_nonce cookie is set and sent on verify)
        setStatus("fetching-nonce");
        const nonceRes = await fetch("/api/auth/nonce", { credentials: "include" });
        if (!nonceRes.ok) throw new Error("Failed to fetch nonce");
        const { nonce } = await nonceRes.json();

        // 2. Construct and sign SIWE message
        setStatus("signing");
        const siweMessage = new SiweMessage({
          domain: window.location.host,
          address,
          statement: "Sign in to PayMCP",
          uri: window.location.origin,
          version: "1",
          chainId,
          nonce,
        });
        const messageString = siweMessage.prepareMessage();
        const signature = await signMessageAsync({ message: messageString });

        // 3. Verify with backend (credentials so siwe_nonce cookie is sent)
        setStatus("verifying");
        const verifyRes = await fetch("/api/auth/verify", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: messageString, signature }),
        });

        if (!verifyRes.ok) {
          const data = await verifyRes.json();
          throw new Error(data.error || "Verification failed");
        }

        setStatus("success");
        return true;
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Authentication failed");
        return false;
      }
    },
    [signMessageAsync],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
  }, []);

  return { authenticate, status, error, reset };
}

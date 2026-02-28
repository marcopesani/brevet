"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useChain } from "@/contexts/chain-context";

/**
 * Thin client component that triggers a server re-render when the user
 * switches chains. The server components re-render with the new cookie
 * chain value, so the correct account state is determined server-side.
 */
export default function ChainRefresher({
  serverChainId,
}: {
  serverChainId: number;
}) {
  const { activeChain } = useChain();
  const router = useRouter();
  const clientChainId = activeChain.chain.id;
  const prevChainIdRef = useRef(clientChainId);

  useEffect(() => {
    if (prevChainIdRef.current !== clientChainId) {
      prevChainIdRef.current = clientChainId;
      // ChainProvider already set the cookie — refresh server components
      router.refresh();
    }
  }, [clientChainId, router]);

  // Also refresh if client chain doesn't match server chain on mount
  // (e.g. wallet was switched externally before hydration)
  useEffect(() => {
    if (serverChainId !== clientChainId) {
      router.refresh();
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

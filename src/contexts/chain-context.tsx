"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { toast } from "sonner";
import {
  getDefaultChainConfig,
  getChainById,
  getAllChains,
  type ChainConfig,
} from "@/lib/chain-config";
import { CHAIN_COOKIE_NAME } from "@/lib/chain-cookie";

interface ChainContextType {
  activeChain: ChainConfig;
  setActiveChainId: (chainId: number) => void;
  supportedChains: ChainConfig[];
  isSwitchingChain: boolean;
}

const ChainContext = createContext<ChainContextType | undefined>(undefined);

function setChainCookie(chainId: number) {
  if (typeof window !== "undefined") {
    document.cookie = `${CHAIN_COOKIE_NAME}=${chainId}; path=/; max-age=31536000; SameSite=Lax; Secure`;
  }
}

export function ChainProvider({
  children,
  initialChainId,
  enabledChains,
}: {
  children: ReactNode;
  initialChainId?: number;
  enabledChains?: number[];
}) {
  const allChains = getAllChains();
  const enabledSet =
    enabledChains && enabledChains.length > 0
      ? new Set(enabledChains)
      : null;
  const filteredChains = enabledSet
    ? allChains.filter((c) => enabledSet.has(c.chain.id))
    : allChains;

  // Server already validates initialChainId against enabledChains
  // (resolveValidChainId in layout.tsx). Client-side check is a safety net.
  const [activeChainId, setActiveChainIdState] = useState<number>(() => {
    const preferred = initialChainId ?? getDefaultChainConfig().chain.id;
    if (enabledSet && !enabledSet.has(preferred) && filteredChains.length > 0) {
      return filteredChains[0].chain.id;
    }
    return preferred;
  });

  const { chainId: walletChainId, isConnected } = useAccount();
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();

  const isSwitchingRef = useRef(false);

  // Auto-switch to first enabled chain when enabledChains changes at
  // runtime (e.g. user toggles chains in settings) and current selection
  // is no longer valid.
  useEffect(() => {
    if (!enabledSet || filteredChains.length === 0) return;
    if (enabledSet.has(activeChainId)) return;
    const fallback = filteredChains[0].chain.id;
    setActiveChainIdState(fallback);
    setChainCookie(fallback);
  }, [enabledSet, filteredChains, activeChainId]);

  // Sync activeChainId to wallet's chain when it changes externally.
  // Only syncs if the wallet's chain is both supported AND enabled for
  // this user — prevents the infinite loop between this effect and the
  // auto-switch effect above.
  useEffect(() => {
    if (!isConnected || !walletChainId || isSwitchingRef.current) return;
    if (walletChainId === activeChainId) return;
    if (!getChainById(walletChainId)) return;
    if (enabledSet && !enabledSet.has(walletChainId)) return;
    setActiveChainIdState(walletChainId);
    setChainCookie(walletChainId);
  }, [walletChainId, isConnected, activeChainId, enabledSet]);

  const setActiveChainId = useCallback(
    async (chainId: number) => {
      if (!getChainById(chainId)) return;

      if (isConnected) {
        isSwitchingRef.current = true;
        try {
          await switchChainAsync({ chainId });
          setActiveChainIdState(chainId);
          setChainCookie(chainId);
        } catch {
          toast.error("Failed to switch network");
        } finally {
          isSwitchingRef.current = false;
        }
      } else {
        setActiveChainIdState(chainId);
        setChainCookie(chainId);
      }
    },
    [isConnected, switchChainAsync],
  );

  const activeChain = getChainById(activeChainId) ?? getDefaultChainConfig();

  return (
    <ChainContext.Provider
      value={{
        activeChain,
        setActiveChainId,
        supportedChains: filteredChains,
        isSwitchingChain,
      }}
    >
      {children}
    </ChainContext.Provider>
  );
}

export function useChain() {
  const context = useContext(ChainContext);
  if (!context)
    throw new Error("useChain must be used within a ChainProvider");
  return context;
}

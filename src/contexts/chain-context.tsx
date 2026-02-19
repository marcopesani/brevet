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
  getChainConfig,
  SUPPORTED_CHAINS,
  type ChainConfig,
} from "@/lib/chain-config";

interface ChainContextType {
  activeChain: ChainConfig;
  setActiveChainId: (chainId: number) => void;
  supportedChains: typeof SUPPORTED_CHAINS;
  isSwitchingChain: boolean;
}

const ChainContext = createContext<ChainContextType | undefined>(undefined);

function updateLocalStorage(chainId: number) {
  if (typeof window !== "undefined") {
    localStorage.setItem("brevet-active-chain", String(chainId));
  }
}

export function ChainProvider({ children }: { children: ReactNode }) {
  const [activeChainId, setActiveChainIdState] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("brevet-active-chain");
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (getChainConfig(parsed)) return parsed;
      }
    }
    return getDefaultChainConfig().chain.id;
  });

  const { chainId: walletChainId, isConnected } = useAccount();
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();

  // Track whether a programmatic switch is in progress to avoid sync loops
  const isSwitchingRef = useRef(false);

  // Sync activeChainId to wallet's chain when it changes externally
  useEffect(() => {
    if (!isConnected || !walletChainId || isSwitchingRef.current) return;
    if (walletChainId === activeChainId) return;
    // Only sync if the wallet's chain is one we support
    if (!getChainConfig(walletChainId)) return;
    setActiveChainIdState(walletChainId);
    updateLocalStorage(walletChainId);
  }, [walletChainId, isConnected, activeChainId]);

  const setActiveChainId = useCallback(
    async (chainId: number) => {
      if (!getChainConfig(chainId)) return;

      if (isConnected) {
        // Wallet connected: request chain switch, only update on success
        isSwitchingRef.current = true;
        try {
          await switchChainAsync({ chainId });
          setActiveChainIdState(chainId);
          updateLocalStorage(chainId);
        } catch {
          toast.error("Failed to switch network");
        } finally {
          isSwitchingRef.current = false;
        }
      } else {
        // No wallet: update local state + localStorage immediately
        setActiveChainIdState(chainId);
        updateLocalStorage(chainId);
      }
    },
    [isConnected, switchChainAsync],
  );

  const activeChain = getChainConfig(activeChainId) ?? getDefaultChainConfig();

  return (
    <ChainContext.Provider
      value={{
        activeChain,
        setActiveChainId,
        supportedChains: SUPPORTED_CHAINS,
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

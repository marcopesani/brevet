"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
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
}

const ChainContext = createContext<ChainContextType | undefined>(undefined);

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

  const setActiveChainId = (chainId: number) => {
    if (!getChainConfig(chainId)) return;
    setActiveChainIdState(chainId);
    if (typeof window !== "undefined") {
      localStorage.setItem("brevet-active-chain", String(chainId));
    }
  };

  const activeChain = getChainConfig(activeChainId) ?? getDefaultChainConfig();

  return (
    <ChainContext.Provider
      value={{ activeChain, setActiveChainId, supportedChains: SUPPORTED_CHAINS }}
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

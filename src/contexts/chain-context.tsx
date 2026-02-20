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
import { CHAIN_COOKIE_NAME } from "@/lib/chain-cookie";

interface ChainContextType {
  activeChain: ChainConfig;
  setActiveChainId: (chainId: number) => void;
  supportedChains: typeof SUPPORTED_CHAINS;
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
}: {
  children: ReactNode;
  initialChainId?: number;
}) {
  const [activeChainId, setActiveChainIdState] = useState<number>(
    () => initialChainId ?? getDefaultChainConfig().chain.id,
  );

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
    setChainCookie(walletChainId);
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
          setChainCookie(chainId);
        } catch {
          toast.error("Failed to switch network");
        } finally {
          isSwitchingRef.current = false;
        }
      } else {
        // No wallet: update local state + cookie immediately
        setActiveChainIdState(chainId);
        setChainCookie(chainId);
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

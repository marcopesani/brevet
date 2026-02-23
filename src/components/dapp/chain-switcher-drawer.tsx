"use client";

import { Check, ChevronRight } from "lucide-react";
import { useChain } from "@/contexts/chain-context";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { getAllChains, type ChainConfig } from "@/lib/chain-config";

interface ChainSwitcherDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChainSwitcherDrawer({
  open,
  onOpenChange,
}: ChainSwitcherDrawerProps) {
  const { activeChain, setActiveChainId, isSwitchingChain } = useChain();
  const allChains = getAllChains();

  // Group by testnet/mainnet for organization
  const mainnetChains = allChains.filter((c) => !c.isTestnet);
  const testnetChains = allChains.filter((c) => c.isTestnet);

  async function handleChainSelect(chainId: number) {
    if (chainId === activeChain.chain.id) {
      onOpenChange(false);
      return;
    }

    try {
      await setActiveChainId(chainId);
      onOpenChange(false);
    } catch {
      // Error handling is done in the context
    }
  }

  function ChainRow({ chain }: { chain: ChainConfig }) {
    const isActive = chain.chain.id === activeChain.chain.id;
    const isLoading = isSwitchingChain && chain.chain.id === activeChain.chain.id;

    return (
      <button
        onClick={() => handleChainSelect(chain.chain.id)}
        disabled={isLoading}
        className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition-all ${
          isActive
            ? "border-primary bg-primary/5"
            : "border-border bg-background hover:bg-accent"
        } ${isLoading ? "opacity-70" : ""}`}
      >
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${chain.color}`} />
          <div>
            <p className="font-medium">{chain.displayName}</p>
            <p className="text-xs text-muted-foreground">
              {chain.isTestnet ? "Testnet" : "Mainnet"}
            </p>
          </div>
        </div>
        {isActive && (
          <div className="flex items-center gap-1 text-primary">
            <Check className="h-4 w-4" />
          </div>
        )}
        {!isActive && !isLoading && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        {isLoading && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        )}
      </button>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[80vh]">
        <DrawerHeader>
          <DrawerTitle>Switch Network</DrawerTitle>
        </DrawerHeader>
        <div className="space-y-4 px-4 pb-6">
          {/* Mainnet Chains */}
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Mainnet
            </p>
            <div className="space-y-2">
              {mainnetChains.map((chain) => (
                <ChainRow key={chain.chain.id} chain={chain} />
              ))}
            </div>
          </div>

          {/* Testnet Chains */}
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Testnet
            </p>
            <div className="space-y-2">
              {testnetChains.map((chain) => (
                <ChainRow key={chain.chain.id} chain={chain} />
              ))}
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

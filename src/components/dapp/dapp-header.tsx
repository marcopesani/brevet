"use client";

import { useState } from "react";
import { Settings, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useChain } from "@/contexts/chain-context";
import { ChainSwitcherDrawer } from "./chain-switcher-drawer";
import { SettingsDrawer } from "./settings-drawer";

interface DappHeaderProps {
  initialPendingCount: number;
}

export function DappHeader({ initialPendingCount }: DappHeaderProps) {
  const [chainDrawerOpen, setChainDrawerOpen] = useState(false);
  const [settingsDrawerOpen, setSettingsDrawerOpen] = useState(false);
  const { activeChain, isSwitchingChain } = useChain();

  // Pulse animation on pending count change would go here
  const hasPending = initialPendingCount > 0;

  return (
    <>
      <header className="flex items-center justify-between py-2">
        {/* Chain Switcher Pill */}
        <button
          onClick={() => setChainDrawerOpen(true)}
          disabled={isSwitchingChain}
          className="group flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-sm font-medium transition-all hover:bg-accent active:scale-95"
        >
          <span
            className={`h-2 w-2 rounded-full transition-colors duration-200 ${
              isSwitchingChain ? "animate-pulse bg-muted-foreground" : activeChain.color
            }`}
          />
          <span className="transition-all duration-200 group-hover:translate-x-0.5">
            {activeChain.displayName}
          </span>
          <span className="text-xs text-muted-foreground">▾</span>
        </button>

        {/* Right side: Pending badge + Settings */}
        <div className="flex items-center gap-2">
          {hasPending && (
            <Badge
              variant="destructive"
              className="animate-in slide-in-from-right-2 fade-in duration-300"
            >
              <Bell className="mr-1 h-3 w-3" />
              {initialPendingCount}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSettingsDrawerOpen(true)}
            className="h-9 w-9 rounded-full"
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Drawers */}
      <ChainSwitcherDrawer
        open={chainDrawerOpen}
        onOpenChange={setChainDrawerOpen}
      />
      <SettingsDrawer
        open={settingsDrawerOpen}
        onOpenChange={setSettingsDrawerOpen}
      />
    </>
  );
}

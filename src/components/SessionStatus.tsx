"use client";

import { useAppKitAccount, useAppKitNetwork } from "@reown/appkit/react";
import { useAppKit } from "@reown/appkit/library/react";
import { useDisconnect } from "wagmi";
import {
  getSessionStatus,
  truncateAddress,
  type SessionStatus as SessionStatusType,
} from "@/lib/walletconnect-session";

const statusConfig: Record<
  SessionStatusType,
  { color: string; bg: string; label: string }
> = {
  connected: {
    color: "bg-green-500",
    bg: "bg-green-50 dark:bg-green-950/30",
    label: "Connected",
  },
  expiring: {
    color: "bg-yellow-500",
    bg: "bg-yellow-50 dark:bg-yellow-950/30",
    label: "Expiring Soon",
  },
  disconnected: {
    color: "bg-red-500",
    bg: "bg-red-50 dark:bg-red-950/30",
    label: "Disconnected",
  },
};

export default function SessionStatus() {
  const { address, isConnected } = useAppKitAccount();
  const { caipNetwork } = useAppKitNetwork();
  const { open } = useAppKit();
  const { disconnect } = useDisconnect();

  const status = getSessionStatus(isConnected);
  const config = statusConfig[status];
  const chainName = caipNetwork?.name ?? "Unknown";

  return (
    <div
      className={`flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800 ${config.bg}`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${config.color}`}
          aria-label={`Wallet ${config.label.toLowerCase()}`}
        />
        <div className="flex flex-col">
          <span className="text-sm font-medium text-black dark:text-zinc-50">
            {config.label}
          </span>
          {isConnected && address ? (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {truncateAddress(address)} &middot; {chainName}
            </span>
          ) : (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              No wallet connected
            </span>
          )}
        </div>
      </div>

      <div>
        {isConnected ? (
          <button
            onClick={() => disconnect()}
            className="rounded px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-950/50"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={() => open()}
            className="rounded bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
          >
            Reconnect
          </button>
        )}
      </div>
    </div>
  );
}

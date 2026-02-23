"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, RefreshCw, Globe, Key, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useChain } from "@/contexts/chain-context";
import {
  getEnabledChainsAction,
  updateEnabledChainsAction,
} from "@/app/actions/user";
import {
  getApiKeyInfo,
  regenerateApiKey,
} from "@/app/actions/api-key";
import { getAllChains } from "@/lib/chain-config";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface SettingsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDrawer({ open, onOpenChange }: SettingsDrawerProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeChain, supportedChains } = useChain();
  const allChains = getAllChains();

  const [copied, setCopied] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [newApiKey, setNewApiKey] = useState<string | null>(null);

  // Query for API key prefix
  const { data: apiKeyData } = useQuery({
    queryKey: ["api-key-info"],
    queryFn: () => getApiKeyInfo(),
    enabled: open,
  });

  // Query for enabled chains
  const { data: enabledChainIds } = useQuery({
    queryKey: ["enabled-chains"],
    queryFn: () => getEnabledChainsAction(),
    initialData: supportedChains.map((c) => c.chain.id),
    enabled: open,
  });

  async function handleCopy(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success(`${label} copied`);
    setTimeout(() => setCopied(null), 2000);

    // Haptic feedback
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(10);
    }
  }

  async function handleRotateApiKey() {
    startTransition(async () => {
      try {
        const result = await regenerateApiKey();
        setNewApiKey(result.rawKey);
        queryClient.invalidateQueries({ queryKey: ["api-key-info"] });
        toast.success("API key rotated");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to rotate API key");
      }
    });
  }

  async function handleToggleChain(chainId: number, enabled: boolean) {
    const current = enabledChainIds ?? supportedChains.map((c) => c.chain.id);
    const updated = enabled
      ? [...current, chainId]
      : current.filter((id) => id !== chainId);

    startTransition(async () => {
      try {
        await updateEnabledChainsAction(updated);
        queryClient.invalidateQueries({ queryKey: ["enabled-chains"] });
        toast.success(enabled ? "Chain enabled" : "Chain disabled");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update chains");
      }
    });
  }

  const mcpUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/mcp/{userId}`
    : "";

  const apiKeyPrefix = apiKeyData?.prefix;
  const apiKeyDisplay = newApiKey
    ? `${newApiKey.slice(0, 12)}...${newApiKey.slice(-4)}`
    : apiKeyPrefix
      ? `${apiKeyPrefix}...`
      : "Not set";

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader>
          <DrawerTitle>Settings</DrawerTitle>
        </DrawerHeader>
        <div className="space-y-6 px-4 pb-6">
          {/* MCP Endpoint */}
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Globe className="h-4 w-4" />
              <span>MCP Endpoint</span>
            </div>
            <div className="rounded-lg border bg-muted/50 p-3">
              <p className="mb-2 text-xs text-muted-foreground">
                Use this URL in your MCP client:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate text-xs font-mono">{mcpUrl}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => handleCopy(mcpUrl, "MCP URL")}
                >
                  {copied === "MCP URL" ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </section>

          {/* API Key */}
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Key className="h-4 w-4" />
              <span>API Key</span>
            </div>
            <div className="rounded-lg border bg-muted/50 p-3">
              <div className="flex items-center justify-between gap-2">
                <code className="text-sm font-mono">{apiKeyDisplay}</code>
                <div className="flex items-center gap-1">
                  {newApiKey && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleCopy(newApiKey, "API Key")}
                    >
                      {copied === "API Key" ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleRotateApiKey}
                    disabled={isPending}
                  >
                    <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>
              {newApiKey && (
                <p className="mt-2 text-xs text-amber-500">
                  Copy this now — it won&apos;t be shown again!
                </p>
              )}
            </div>
          </section>

          {/* Enabled Chains */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <LinkIcon className="h-4 w-4" />
              <span>Enabled Chains</span>
            </div>
            <div className="space-y-2">
              {allChains.map((chain) => {
                const isEnabled = (enabledChainIds ?? []).includes(chain.chain.id);
                const isActive = chain.chain.id === activeChain.chain.id;

                return (
                  <div
                    key={chain.chain.id}
                    className={`flex items-center justify-between rounded-lg border p-3 ${
                      isActive ? "border-primary/50 bg-primary/5" : "border-border"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`h-2 w-2 rounded-full ${chain.color}`} />
                      <div>
                        <p className="font-medium">{chain.displayName}</p>
                        <p className="text-xs text-muted-foreground">
                          {chain.isTestnet ? "Testnet" : "Mainnet"}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={(checked) =>
                        handleToggleChain(chain.chain.id, checked)
                      }
                      disabled={isPending}
                    />
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Disabled chains won&apos;t be available to your MCP agents.
            </p>
          </section>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

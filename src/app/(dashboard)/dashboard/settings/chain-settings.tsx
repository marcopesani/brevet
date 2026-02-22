"use client";

import { useState, useTransition } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { getEnvironmentChains } from "@/lib/chain-config";
import type { ChainConfig } from "@/lib/chain-config";
import { updateEnabledChainsAction } from "@/app/actions/user";

function ChainDot({ color }: { color: string }) {
  return (
    <span
      className={`inline-block size-2.5 shrink-0 rounded-full ${color}`}
    />
  );
}

export function ChainSettings({
  initialEnabledChains,
}: {
  initialEnabledChains: number[];
}) {
  const [enabledChains, setEnabledChains] = useState<number[]>(initialEnabledChains);
  const [isPending, startTransition] = useTransition();
  const [warning, setWarning] = useState<string | null>(null);

  const environmentChains: ChainConfig[] = getEnvironmentChains();

  function handleToggle(chainId: number, checked: boolean) {
    const updated = checked
      ? [...enabledChains, chainId]
      : enabledChains.filter((id) => id !== chainId);

    if (updated.length === 0) {
      setWarning(
        "Disabling all chains means no payments can be processed. You can re-enable chains at any time.",
      );
    } else {
      setWarning(null);
    }

    setEnabledChains(updated);

    startTransition(async () => {
      try {
        const result = await updateEnabledChainsAction(updated);
        setEnabledChains(result);
      } catch {
        setEnabledChains(enabledChains);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enabled Chains</CardTitle>
        <CardDescription>
          Choose which chains your MCP agent can use for x402 payments.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {environmentChains.map((config) => {
          const chainId = config.chain.id;
          const isEnabled = enabledChains.includes(chainId);

          return (
            <div
              key={chainId}
              className="flex items-center justify-between gap-4"
            >
              <Label
                htmlFor={`chain-${chainId}`}
                className="flex items-center gap-2 font-normal"
              >
                <ChainDot color={config.color} />
                <span>{config.displayName}</span>
                <span className="text-muted-foreground text-xs">
                  ({chainId})
                </span>
                {config.isTestnet && (
                  <Badge
                    variant="outline"
                    className="px-1 py-0 text-[10px] leading-tight"
                  >
                    Testnet
                  </Badge>
                )}
              </Label>
              <Switch
                id={`chain-${chainId}`}
                checked={isEnabled}
                onCheckedChange={(checked) =>
                  handleToggle(chainId, checked)
                }
                disabled={isPending}
              />
            </div>
          );
        })}

        {warning && (
          <p className="text-destructive text-sm">{warning}</p>
        )}
      </CardContent>
    </Card>
  );
}

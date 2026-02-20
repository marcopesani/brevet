"use client";

import { Wallet } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface NoAccountCardProps {
  chainId: number;
  chainName: string;
  hasAnyAccounts: boolean;
  onSetup: (chainId: number) => void;
  setupPending: boolean;
}

export default function NoAccountCard({
  chainId,
  chainName,
  hasAnyAccounts,
  onSetup,
  setupPending,
}: NoAccountCardProps) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            {hasAnyAccounts
              ? `Set Up Smart Account on ${chainName}`
              : "Set Up Your First Smart Account"}
          </CardTitle>
          <CardDescription>
            {hasAnyAccounts
              ? `You don't have a smart account on ${chainName} yet. Set one up to enable AI agent payments on this chain.`
              : "Create a smart account to enable your AI agents to make x402 payments with USDC."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            A smart account will be created with a session key for automated
            payments. You&apos;ll need to authorize the session key after setup.
          </p>
        </CardContent>
        <CardFooter>
          <Button
            onClick={() => onSetup(chainId)}
            disabled={setupPending}
            className="w-full"
          >
            {setupPending ? "Setting up..." : `Set Up on ${chainName}`}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

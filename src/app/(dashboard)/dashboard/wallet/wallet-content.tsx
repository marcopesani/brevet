"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import WalletBalance from "@/components/wallet-balance";
import FundWalletForm from "@/components/fund-wallet-form";
import WithdrawWalletForm from "@/components/withdraw-wallet-form";
import SessionKeyAuthCard from "@/components/session-key-auth-card";
import { useWalletBalance } from "@/hooks/use-wallet-balance";
import { useChain } from "@/contexts/chain-context";
import {
  setupSmartAccount,
  getSmartAccountForChain,
  getAllSmartAccountsAction,
} from "@/app/actions/smart-account";

interface WalletContentProps {
  userId: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function WalletContent({ userId }: WalletContentProps) {
  const { activeChain } = useChain();
  const chainId = activeChain.chain.id;
  const queryClient = useQueryClient();

  // Fetch smart account for current chain
  const {
    data: smartAccount,
    isLoading: accountLoading,
  } = useQuery({
    queryKey: ["smart-account", chainId],
    queryFn: () => getSmartAccountForChain(chainId),
  });

  // Fetch all smart accounts (to distinguish "first account ever" vs "no account on this chain")
  const { data: allAccounts } = useQuery({
    queryKey: ["smart-accounts-all"],
    queryFn: () => getAllSmartAccountsAction(),
  });

  // Setup mutation
  const { mutate: doSetup, isPending: setupPending } = useMutation({
    mutationFn: (cId: number) => setupSmartAccount(cId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["smart-account", chainId] });
      queryClient.invalidateQueries({ queryKey: ["smart-accounts-all"] });
    },
  });

  const smartAccountAddress = smartAccount?.smartAccountAddress ?? null;
  const sessionKeyStatus = smartAccount?.sessionKeyStatus ?? null;

  const {
    balance: liveBalance,
    isLoading: balanceLoading,
    error: balanceError,
  } = useWalletBalance(!!smartAccountAddress, undefined, chainId);

  // STATE 1: No account for this chain
  if (!accountLoading && !smartAccount) {
    const hasAnyAccounts = allAccounts && allAccounts.length > 0;

    return (
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              {hasAnyAccounts
                ? `Set Up Smart Account on ${activeChain.chain.name}`
                : "Set Up Your First Smart Account"}
            </CardTitle>
            <CardDescription>
              {hasAnyAccounts
                ? `You don't have a smart account on ${activeChain.chain.name} yet. Set one up to enable AI agent payments on this chain.`
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
              onClick={() => doSetup(chainId)}
              disabled={setupPending}
              className="w-full"
            >
              {setupPending
                ? "Setting up..."
                : `Set Up on ${activeChain.chain.name}`}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // STATE 2: Pending grant — account exists but session key not authorized
  if (sessionKeyStatus === "pending_grant") {
    return (
      <div className="flex flex-col gap-6">
        <SessionKeyAuthCard
          smartAccountAddress={smartAccountAddress}
          sessionKeyAddress={smartAccount?.sessionKeyAddress}
          chainId={chainId}
        />

        {/* Show fund form so user can pre-fund while waiting for authorization */}
        <div className="grid gap-6 md:grid-cols-2">
          <FundWalletForm accountAddress={smartAccountAddress} chainId={chainId} />
        </div>
      </div>
    );
  }

  // STATE 3: Active — full dashboard
  return (
    <div className="flex flex-col gap-6">
      <WalletBalance
        accountAddress={smartAccountAddress}
        balance={liveBalance}
        balanceLoading={accountLoading || balanceLoading}
        balanceError={balanceError}
        chainName={activeChain.chain.name}
        explorerUrl={activeChain.explorerUrl}
        sessionKeyStatus={sessionKeyStatus}
      />

      <div className="grid gap-6 md:grid-cols-2">
        <FundWalletForm accountAddress={smartAccountAddress} chainId={chainId} />
        <WithdrawWalletForm balance={liveBalance} chainId={chainId} />
      </div>
    </div>
  );
}

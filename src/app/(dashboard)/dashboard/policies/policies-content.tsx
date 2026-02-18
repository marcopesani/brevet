"use client";

import { useMemo } from "react";
import { useChain } from "@/contexts/chain-context";
import { PolicyTable } from "@/components/policy-table";

interface Policy {
  id: string;
  endpointPattern: string;
  payFromHotWallet: boolean;
  status: string;
  archivedAt: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  chainId?: number;
}

interface PoliciesContentProps {
  allPolicies: Policy[];
}

export default function PoliciesContent({ allPolicies }: PoliciesContentProps) {
  const { activeChain } = useChain();
  const chainId = activeChain.chain.id;

  const filteredPolicies = useMemo(
    () => allPolicies.filter((p) => p.chainId === chainId),
    [allPolicies, chainId],
  );

  return (
    <div className="flex flex-col gap-6">
      <PolicyTable
        initialPolicies={filteredPolicies}
        chainName={activeChain.chain.name}
        chainId={chainId}
      />
    </div>
  );
}

"use client";

import { useMemo } from "react";
import { useChain } from "@/contexts/chain-context";
import { PolicyTable } from "@/components/policy-table";
import type { EndpointPolicyDTO } from "@/lib/models/endpoint-policy";

interface PoliciesContentProps {
  allPolicies: EndpointPolicyDTO[];
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
        chainName={activeChain.displayName}
        chainId={chainId}
      />
    </div>
  );
}

"use client";

import { useState, useMemo } from "react";
import { Shield, Plus, Archive, Check, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getPolicies } from "@/app/actions/policies";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  toggleAutoSign,
  archivePolicy,
  activatePolicy,
} from "@/app/actions/policies";
import { PolicyDetailDrawer } from "./policy-detail-drawer";
import { AddPolicyDrawer } from "./add-policy-drawer";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SerializedPolicy {
  id: string;
  endpointPattern: string;
  autoSign: boolean;
  chainId: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

interface PolicyListProps {
  initialPolicies: SerializedPolicy[];
  chainId: number;
}

export function PolicyList({ initialPolicies, chainId }: PolicyListProps) {
  const [selectedPolicy, setSelectedPolicy] = useState<SerializedPolicy | null>(null);
  const [addDrawerOpen, setAddDrawerOpen] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Fetch fresh policies - start with initial data from server
  const { data: rawPolicies, refetch } = useQuery<SerializedPolicy[]>({
    queryKey: ["policies", chainId],
    queryFn: async () => {
      const result = await getPolicies();
      // Map and serialize the result
      return result.map((p: Record<string, unknown>) => ({
        id: String(p.id),
        endpointPattern: String(p.endpointPattern),
        autoSign: Boolean(p.autoSign),
        chainId: Number(p.chainId),
        status: String(p.status),
        createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
        updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : String(p.updatedAt),
        archivedAt: p.archivedAt
          ? (p.archivedAt instanceof Date ? p.archivedAt.toISOString() : String(p.archivedAt))
          : null,
      }));
    },
    initialData: initialPolicies,
  });

  const policies = rawPolicies;

  // Filter active policies for this chain
  const activePolicies = useMemo(() => {
    return policies.filter(
      (p) => p.chainId === chainId && p.status === "active" && !p.archivedAt,
    );
  }, [policies, chainId]);

  // Draft policies (pending activation)
  const draftPolicies = useMemo(() => {
    return policies.filter(
      (p) => p.chainId === chainId && p.status === "draft",
    );
  }, [policies, chainId]);

  async function handleToggleAutoSign(policy: SerializedPolicy) {
    setProcessingId(policy.id);
    try {
      await toggleAutoSign(policy.id, !policy.autoSign);
      toast.success(policy.autoSign ? "Auto-sign disabled" : "Auto-sign enabled");
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to toggle");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleArchive(policy: SerializedPolicy) {
    setProcessingId(policy.id);
    try {
      await archivePolicy(policy.id);
      toast.success("Policy archived");
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to archive");
    } finally {
      setProcessingId(null);
      setSelectedPolicy(null);
    }
  }

  async function handleActivate(policy: SerializedPolicy) {
    setProcessingId(policy.id);
    try {
      await activatePolicy(policy.id);
      toast.success("Policy activated!");
      await refetch();

      // Haptic feedback
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(10);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to activate");
    } finally {
      setProcessingId(null);
    }
  }

  function formatPattern(pattern: string): string {
    // Remove protocol and common prefixes for display
    return pattern
      .replace(/^https?:\/\//, "")
      .replace(/^\*\./, "")
      .slice(0, 30);
  }

  return (
    <section className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-blue-500" />
          <h2 className="font-semibold">Policies ({activePolicies.length})</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAddDrawerOpen(true)}
          className="h-8"
        >
          <Plus className="mr-1 h-4 w-4" />
          Add
        </Button>
      </div>

      {/* Draft Policies - Prominent */}
      {draftPolicies.length > 0 && (
        <div className="space-y-2">
          {draftPolicies.map((policy) => (
            <button
              key={policy.id}
              onClick={() => handleActivate(policy)}
              disabled={processingId === policy.id}
              className={cn(
                "w-full rounded-lg border border-amber-500/50 bg-amber-500/5 p-3",
                "flex items-center justify-between transition-all",
                "hover:bg-amber-500/10 active:scale-[0.99]",
              )}
            >
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <span className="truncate text-sm font-medium">
                  {formatPattern(policy.endpointPattern)}
                </span>
              </div>
              <Badge
                variant="outline"
                className="border-amber-500/50 text-amber-600"
              >
                {processingId === policy.id ? "Activating..." : "Tap to Activate"}
              </Badge>
            </button>
          ))}
        </div>
      )}

      {/* Active Policies */}
      <div className="space-y-2">
        {activePolicies.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-center">
            <p className="text-sm text-muted-foreground">
              No active policies for this chain
            </p>
          </div>
        ) : (
          activePolicies.map((policy, index) => (
            <div
              key={policy.id}
              className="animate-card-enter rounded-lg border bg-card p-3 transition-all active:scale-[0.99]"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => setSelectedPolicy(policy)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate font-medium">
                    {formatPattern(policy.endpointPattern)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {policy.autoSign ? "Auto-sign enabled" : "Manual approval"}
                  </p>
                </button>

                <Switch
                  checked={policy.autoSign}
                  onCheckedChange={() => handleToggleAutoSign(policy)}
                  disabled={processingId === policy.id}
                />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Drawers */}
      <PolicyDetailDrawer
        policy={selectedPolicy}
        open={!!selectedPolicy}
        onOpenChange={(open) => !open && setSelectedPolicy(null)}
        onArchive={handleArchive}
      />

      <AddPolicyDrawer
        open={addDrawerOpen}
        onOpenChange={setAddDrawerOpen}
        chainId={chainId}
        onSuccess={() => refetch()}
      />
    </section>
  );
}

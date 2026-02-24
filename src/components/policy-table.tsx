"use client";

import { useTransition } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Plus, Shield } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddPolicyDialog } from "@/components/add-policy-dialog";
import {
  activatePolicy,
  toggleAutoSign,
  archivePolicy,
  unarchivePolicy,
} from "@/app/actions/policies";

interface Policy {
  id: string;
  endpointPattern: string;
  autoSign: boolean;
  status: string;
  archivedAt: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

type TabFilter = "all" | "active" | "draft" | "archived";

interface PolicyTableProps {
  initialPolicies: Policy[];
  chainName?: string;
  chainId?: number;
}

export function PolicyTable({ initialPolicies, chainName, chainId }: PolicyTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState<TabFilter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const policies = initialPolicies;

  async function handleActivate(policyId: string) {
    setActionInProgress(policyId);
    try {
      await activatePolicy(policyId);
      toast.success("Policy activated");
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to activate");
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleToggleAutoSign(policy: Policy) {
    setActionInProgress(policy.id);
    try {
      await toggleAutoSign(policy.id, !policy.autoSign);
      toast.success(
        `Auto-sign ${!policy.autoSign ? "enabled" : "disabled"}`
      );
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleArchive(policyId: string) {
    setActionInProgress(policyId);
    try {
      await archivePolicy(policyId);
      toast.success("Policy archived");
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to archive");
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleUnarchive(policyId: string) {
    setActionInProgress(policyId);
    try {
      await unarchivePolicy(policyId);
      toast.success("Policy reactivated");
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reactivate");
    } finally {
      setActionInProgress(null);
    }
  }

  function handlePolicyCreated() {
    startTransition(() => {
      router.refresh();
    });
  }

  const draftCount = policies.filter((p) => p.status === "draft").length;
  const filtered =
    tab === "all" ? policies : policies.filter((p) => p.status === tab);

  function statusBadge(status: string) {
    switch (status) {
      case "active":
        return (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
            active
          </Badge>
        );
      case "draft":
        return (
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
            draft
          </Badge>
        );
      case "archived":
        return (
          <Badge variant="secondary" className="text-muted-foreground">
            archived
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            {status}
          </Badge>
        );
    }
  }

  const isBusy = isPending || actionInProgress !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="size-5" />
          Endpoint Policies{chainName ? ` — ${chainName}` : ""}
        </CardTitle>
        <CardAction>
          <Button
            size="sm"
            onClick={() => setDialogOpen(true)}
            data-testid="open-add-policy-dialog-button"
          >
            <Plus className="size-4" />
            Add Policy
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {draftCount > 0 && (
          <Alert className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertTriangle className="size-4" />
            <AlertTitle>
              {draftCount} new endpoint{draftCount !== 1 ? "s" : ""} need
              {draftCount === 1 ? "s" : ""} policy decisions
            </AlertTitle>
            <AlertDescription>
              Review draft policies below and activate or archive them.
            </AlertDescription>
          </Alert>
        )}

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as TabFilter)}
        >
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="draft">Draft</TabsTrigger>
            <TabsTrigger value="archived">Archived</TabsTrigger>
          </TabsList>

          <TabsContent value={tab}>
            {filtered.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                {tab === "all"
                  ? "No endpoint policies yet. Policies will appear here when endpoints are discovered."
                  : `No ${tab} policies.`}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Endpoint Pattern</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Auto-Sign</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((policy) => {
                    const isActionTarget = actionInProgress === policy.id;
                    const isArchived = policy.status === "archived";
                    return (
                      <TableRow
                        key={policy.id}
                        className={isArchived ? "opacity-60" : ""}
                      >
                        <TableCell className="font-mono text-sm">
                          {policy.endpointPattern}
                        </TableCell>
                        <TableCell>{statusBadge(policy.status)}</TableCell>
                        <TableCell>
                          <Switch
                            checked={policy.autoSign}
                            disabled={isArchived || isBusy}
                            onCheckedChange={() =>
                              handleToggleAutoSign(policy)
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          {isArchived ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isBusy}
                              onClick={() => handleUnarchive(policy.id)}
                            >
                              {isActionTarget ? "..." : "Reactivate"}
                            </Button>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              {policy.status === "draft" && (
                                <Button
                                  size="sm"
                                  variant="default"
                                  disabled={isBusy}
                                  onClick={() => handleActivate(policy.id)}
                                >
                                  {isActionTarget ? "..." : "Activate"}
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isBusy}
                                onClick={() => handleArchive(policy.id)}
                              >
                                {isActionTarget ? "..." : "Archive"}
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

      <AddPolicyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={handlePolicyCreated}
        chainId={chainId}
      />
    </Card>
  );
}

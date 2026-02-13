"use client";

import { useCallback, useEffect, useState } from "react";
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

interface Policy {
  id: string;
  endpointPattern: string;
  payFromHotWallet: boolean;
  status: "draft" | "active" | "archived";
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

type TabFilter = "all" | "active" | "draft" | "archived";

export function PolicyTable() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [tab, setTab] = useState<TabFilter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchPolicies = useCallback(async () => {
    try {
      const res = await fetch("/api/policies");
      if (res.ok) {
        const data = await res.json();
        setPolicies(data);
      }
    } catch {
      // Network error — keep current state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPolicies();
    const interval = setInterval(fetchPolicies, 15_000);
    return () => clearInterval(interval);
  }, [fetchPolicies]);

  async function handleActivate(policyId: string) {
    setActionInProgress(policyId);
    try {
      const res = await fetch(`/api/policies/${policyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      if (res.ok) {
        toast.success("Policy activated");
        fetchPolicies();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to activate");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleToggleHotWallet(policy: Policy) {
    setActionInProgress(policy.id);
    try {
      const res = await fetch(`/api/policies/${policy.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payFromHotWallet: !policy.payFromHotWallet }),
      });
      if (res.ok) {
        toast.success(
          `Hot wallet ${!policy.payFromHotWallet ? "enabled" : "disabled"}`
        );
        fetchPolicies();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to update");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleArchive(policyId: string) {
    setActionInProgress(policyId);
    try {
      const res = await fetch(`/api/policies/${policyId}/archive`, {
        method: "POST",
      });
      if (res.ok) {
        toast.success("Policy archived");
        fetchPolicies();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to archive");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setActionInProgress(null);
    }
  }

  const draftCount = policies.filter((p) => p.status === "draft").length;
  const filtered =
    tab === "all" ? policies : policies.filter((p) => p.status === tab);

  function statusBadge(status: Policy["status"]) {
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
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="size-5" />
          Endpoint Policies
        </CardTitle>
        <CardAction>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
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
            {loading ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                Loading policies...
              </p>
            ) : filtered.length === 0 ? (
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
                    <TableHead>Hot Wallet</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((policy) => {
                    const isBusy = actionInProgress === policy.id;
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
                            checked={policy.payFromHotWallet}
                            disabled={isArchived || actionInProgress !== null}
                            onCheckedChange={() =>
                              handleToggleHotWallet(policy)
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          {!isArchived && (
                            <div className="flex items-center justify-end gap-2">
                              {policy.status === "draft" && (
                                <Button
                                  size="sm"
                                  variant="default"
                                  disabled={actionInProgress !== null}
                                  onClick={() => handleActivate(policy.id)}
                                >
                                  {isBusy ? "..." : "Activate"}
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={actionInProgress !== null}
                                onClick={() => handleArchive(policy.id)}
                              >
                                {isBusy ? "..." : "Archive"}
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
        onSuccess={fetchPolicies}
      />
    </Card>
  );
}

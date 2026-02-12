"use client";

import { useCallback, useEffect, useState } from "react";

interface Policy {
  id: string;
  endpointPattern: string;
  payFromHotWallet: boolean;
  status: "draft" | "active" | "archived";
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EndpointPoliciesProps {
  userId: string;
}

export default function EndpointPolicies({ userId }: EndpointPoliciesProps) {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Suppress unused variable lint — userId is used to scope the component
  // and will be needed when the API requires explicit user filtering
  void userId;

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
    setMessage(null);
    try {
      const res = await fetch(`/api/policies/${policyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      if (res.ok) {
        setMessage({ type: "success", text: "Policy activated" });
        fetchPolicies();
      } else {
        const err = await res.json();
        setMessage({
          type: "error",
          text: err.error || "Failed to activate",
        });
      }
    } catch {
      setMessage({ type: "error", text: "Network error" });
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleToggleHotWallet(policy: Policy) {
    setActionInProgress(policy.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/policies/${policy.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payFromHotWallet: !policy.payFromHotWallet }),
      });
      if (res.ok) {
        setMessage({
          type: "success",
          text: `Hot wallet ${!policy.payFromHotWallet ? "enabled" : "disabled"}`,
        });
        fetchPolicies();
      } else {
        const err = await res.json();
        setMessage({
          type: "error",
          text: err.error || "Failed to update",
        });
      }
    } catch {
      setMessage({ type: "error", text: "Network error" });
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleArchive(policyId: string) {
    setActionInProgress(policyId);
    setMessage(null);
    try {
      const res = await fetch(`/api/policies/${policyId}/archive`, {
        method: "POST",
      });
      if (res.ok) {
        setMessage({ type: "success", text: "Policy archived" });
        fetchPolicies();
      } else {
        const err = await res.json();
        setMessage({
          type: "error",
          text: err.error || "Failed to archive",
        });
      }
    } catch {
      setMessage({ type: "error", text: "Network error" });
    } finally {
      setActionInProgress(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">Loading endpoint policies...</p>
      </div>
    );
  }

  const draftPolicies = policies.filter((p) => p.status === "draft");
  const activePolicies = policies.filter((p) => p.status === "active");
  const archivedPolicies = policies.filter((p) => p.status === "archived");

  return (
    <div className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
      <h2 className="mb-4 text-lg font-semibold text-black dark:text-zinc-50">
        Endpoint Policies
      </h2>

      {message && (
        <p
          className={`mb-3 text-sm ${
            message.type === "success"
              ? "text-green-600 dark:text-green-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {message.text}
        </p>
      )}

      {draftPolicies.length > 0 && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-700 dark:bg-amber-950/30">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            {draftPolicies.length} new endpoint{draftPolicies.length !== 1 ? "s" : ""} need
            {draftPolicies.length === 1 ? "s" : ""} policy decisions
          </p>
        </div>
      )}

      {policies.length === 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No endpoint policies yet. Policies will appear here when endpoints are
          discovered.
        </p>
      )}

      {draftPolicies.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Drafts
          </h3>
          <div className="flex flex-col gap-2">
            {draftPolicies.map((policy) => (
              <PolicyRow
                key={policy.id}
                policy={policy}
                actionInProgress={actionInProgress}
                onActivate={handleActivate}
                onToggleHotWallet={handleToggleHotWallet}
                onArchive={handleArchive}
              />
            ))}
          </div>
        </div>
      )}

      {activePolicies.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Active
          </h3>
          <div className="flex flex-col gap-2">
            {activePolicies.map((policy) => (
              <PolicyRow
                key={policy.id}
                policy={policy}
                actionInProgress={actionInProgress}
                onActivate={handleActivate}
                onToggleHotWallet={handleToggleHotWallet}
                onArchive={handleArchive}
              />
            ))}
          </div>
        </div>
      )}

      {archivedPolicies.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Archived
          </h3>
          <div className="flex flex-col gap-2">
            {archivedPolicies.map((policy) => (
              <PolicyRow
                key={policy.id}
                policy={policy}
                actionInProgress={actionInProgress}
                onActivate={handleActivate}
                onToggleHotWallet={handleToggleHotWallet}
                onArchive={handleArchive}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PolicyRow({
  policy,
  actionInProgress,
  onActivate,
  onToggleHotWallet,
  onArchive,
}: {
  policy: Policy;
  actionInProgress: string | null;
  onActivate: (id: string) => void;
  onToggleHotWallet: (policy: Policy) => void;
  onArchive: (id: string) => void;
}) {
  const isArchived = policy.status === "archived";
  const isDraft = policy.status === "draft";
  const isBusy = actionInProgress === policy.id;

  return (
    <div
      className={`rounded border p-3 ${
        isArchived
          ? "border-zinc-200 bg-zinc-50 opacity-60 dark:border-zinc-800 dark:bg-zinc-900/50"
          : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm text-zinc-900 dark:text-zinc-100">
            {policy.endpointPattern}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                isDraft
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                  : isArchived
                    ? "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500"
                    : "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
              }`}
            >
              {policy.status}
            </span>
            {policy.payFromHotWallet && (
              <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                hot wallet
              </span>
            )}
          </div>
        </div>

        {!isArchived && (
          <div className="flex shrink-0 items-center gap-2">
            {isDraft && (
              <button
                onClick={() => onActivate(policy.id)}
                disabled={actionInProgress !== null}
                className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50 dark:bg-green-700 dark:hover:bg-green-600"
              >
                {isBusy ? "..." : "Activate"}
              </button>
            )}
            <button
              onClick={() => onToggleHotWallet(policy)}
              disabled={actionInProgress !== null}
              className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              {isBusy ? "..." : policy.payFromHotWallet ? "Disable Hot Wallet" : "Enable Hot Wallet"}
            </button>
            <button
              onClick={() => onArchive(policy.id)}
              disabled={actionInProgress !== null}
              className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-red-400 dark:hover:bg-zinc-700"
            >
              {isBusy ? "..." : "Archive"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

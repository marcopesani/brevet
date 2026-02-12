"use client";

import { useCallback, useEffect, useState } from "react";

interface SpendingPoliciesProps {
  userId: string;
}

interface PolicyData {
  perRequestLimit: number;
  perHourLimit: number;
  perDayLimit: number;
  whitelistedEndpoints: string[];
  blacklistedEndpoints: string[];
}

export default function SpendingPolicies({ userId }: SpendingPoliciesProps) {
  const [policy, setPolicy] = useState<PolicyData>({
    perRequestLimit: 0.1,
    perHourLimit: 1.0,
    perDayLimit: 10.0,
    whitelistedEndpoints: [],
    blacklistedEndpoints: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const fetchPolicy = useCallback(async () => {
    try {
      const res = await fetch(`/api/policy?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setPolicy(data);
      }
      // 404 means no policy yet — use defaults
    } catch {
      // Network error — use defaults
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchPolicy();
  }, [fetchPolicy]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          perRequestLimit: policy.perRequestLimit,
          perHourLimit: policy.perHourLimit,
          perDayLimit: policy.perDayLimit,
          whitelistedEndpoints: policy.whitelistedEndpoints,
          blacklistedEndpoints: policy.blacklistedEndpoints,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setPolicy(data);
        setMessage({ type: "success", text: "Policy saved" });
      } else {
        const err = await res.json();
        setMessage({ type: "error", text: err.error || "Failed to save" });
      }
    } catch {
      setMessage({ type: "error", text: "Network error" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">Loading policies...</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSave}
      className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800"
    >
      <h2 className="mb-4 text-lg font-semibold text-black dark:text-zinc-50">
        Spending Policies
      </h2>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            Per-request limit ($)
          </span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={policy.perRequestLimit}
            onChange={(e) =>
              setPolicy({ ...policy, perRequestLimit: parseFloat(e.target.value) || 0 })
            }
            className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            Per-hour limit ($)
          </span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={policy.perHourLimit}
            onChange={(e) =>
              setPolicy({ ...policy, perHourLimit: parseFloat(e.target.value) || 0 })
            }
            className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            Per-day limit ($)
          </span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={policy.perDayLimit}
            onChange={(e) =>
              setPolicy({ ...policy, perDayLimit: parseFloat(e.target.value) || 0 })
            }
            className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            Whitelisted endpoints (one per line)
          </span>
          <textarea
            rows={3}
            value={policy.whitelistedEndpoints.join("\n")}
            onChange={(e) =>
              setPolicy({
                ...policy,
                whitelistedEndpoints: e.target.value
                  ? e.target.value.split("\n").filter(Boolean)
                  : [],
              })
            }
            placeholder="https://api.example.com"
            className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            Blacklisted endpoints (one per line)
          </span>
          <textarea
            rows={3}
            value={policy.blacklistedEndpoints.join("\n")}
            onChange={(e) =>
              setPolicy({
                ...policy,
                blacklistedEndpoints: e.target.value
                  ? e.target.value.split("\n").filter(Boolean)
                  : [],
              })
            }
            placeholder="https://blocked.example.com"
            className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
      </div>

      {message && (
        <p
          className={`mt-3 text-sm ${
            message.type === "success"
              ? "text-green-600 dark:text-green-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="mt-4 rounded bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
      >
        {saving ? "Saving..." : "Save Policies"}
      </button>
    </form>
  );
}

export type RpcStatusLevel = "healthy" | "degraded" | "down";

export type RpcStatus = {
  status: RpcStatusLevel;
  lastError?: string;
  lastErrorAt?: Date;
  lastSuccessAt?: Date;
};

// Module-level singleton — resets on server restart, which is intentional.
// This tracks live RPC availability, not historical data.
const healthMap = new Map<number, RpcStatus>();

/**
 * Returns true if the error looks like an HTTP 429 rate-limit response.
 * Walks the cause chain to handle viem's nested error structure.
 */
export function isRateLimitError(error: unknown): boolean {
  let e: unknown = error;
  while (e) {
    const err = e as { status?: number; message?: string; cause?: unknown };
    if (
      err.status === 429 ||
      (typeof err.message === "string" && err.message.includes("over rate limit")) ||
      (typeof err.message === "string" && err.message.includes("429"))
    ) {
      return true;
    }
    e = err.cause;
  }
  return false;
}

export function reportRpcError(chainId: number, error: unknown): void {
  const existing = healthMap.get(chainId);
  const message =
    error instanceof Error ? error.message : String(error);
  const now = new Date();

  // Escalate from degraded to down after the second consecutive failure
  const nextStatus: RpcStatusLevel =
    existing?.status === "healthy" || !existing ? "degraded" : "down";

  healthMap.set(chainId, {
    status: nextStatus,
    lastError: message,
    lastErrorAt: now,
    lastSuccessAt: existing?.lastSuccessAt,
  });
}

export function reportRpcSuccess(chainId: number): void {
  const existing = healthMap.get(chainId);
  if (existing?.status === "healthy") return; // no-op — avoid unnecessary writes

  healthMap.set(chainId, {
    status: "healthy",
    lastError: undefined,
    lastErrorAt: existing?.lastErrorAt,
    lastSuccessAt: new Date(),
  });
}

export function getRpcHealth(): Record<number, RpcStatus> {
  return Object.fromEntries(healthMap);
}

export function getRpcHealthForChain(chainId: number): RpcStatus {
  return healthMap.get(chainId) ?? { status: "healthy" };
}

/** Aggregate status across all tracked chains. */
export function getOverallRpcStatus(): RpcStatusLevel {
  let worst: RpcStatusLevel = "healthy";
  for (const { status } of healthMap.values()) {
    if (status === "down") return "down";
    if (status === "degraded") worst = "degraded";
  }
  return worst;
}

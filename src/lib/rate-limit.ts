import { NextResponse } from "next/server";

interface RateLimitEntry {
  timestamps: number[];
  firstRequest: number;
}

/** Maximum number of keys in the rate limit store to prevent memory exhaustion (M4). */
const MAX_STORE_SIZE = 10_000;

const store = new Map<string, RateLimitEntry>();

// Clean up stale entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  const cutoff = now - windowMs;
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) store.delete(key);
  }

  // Evict oldest entries if store exceeds max size (M4)
  if (store.size > MAX_STORE_SIZE) {
    const entries = [...store.entries()].sort(
      (a, b) => a[1].firstRequest - b[1].firstRequest,
    );
    const toEvict = entries.slice(0, store.size - MAX_STORE_SIZE);
    for (const [key] of toEvict) {
      store.delete(key);
    }
  }
}

/**
 * Simple in-memory sliding window rate limiter.
 *
 * @param key       Unique key for the rate limit bucket (e.g. IP address)
 * @param limit     Max number of requests allowed in the window
 * @param windowMs  Window size in milliseconds (default: 60 seconds)
 * @returns null if allowed, or a NextResponse with 429 status if rate limited
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number = 60_000,
): NextResponse | null {
  cleanup(windowMs);

  const now = Date.now();
  const cutoff = now - windowMs;

  let entry = store.get(key);
  if (!entry) {
    // If store is at max capacity and this is a new key, rate-limit immediately (M4)
    if (store.size >= MAX_STORE_SIZE) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(windowMs / 1000)),
          },
        },
      );
    }
    entry = { timestamps: [], firstRequest: now };
    store.set(key, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= limit) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(windowMs / 1000)),
        },
      },
    );
  }

  entry.timestamps.push(now);
  return null;
}

/**
 * Extract a client identifier from a request for rate limiting.
 *
 * Priority (M3 hardening):
 * 1. `x-real-ip` — set by the reverse proxy (Vercel/Next.js), not user-spoofable
 * 2. `x-forwarded-for` — take the **last** entry (closest to the server, hardest to spoof)
 * 3. Fall back to `"direct"` so all direct connections share one bucket
 */
export function getClientIp(request: Request): string {
  // Prefer x-real-ip (set by the reverse proxy, not user-controllable)
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  // Fall back to x-forwarded-for, taking the last entry (closest to server)
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",");
    return parts[parts.length - 1].trim();
  }

  return "direct";
}


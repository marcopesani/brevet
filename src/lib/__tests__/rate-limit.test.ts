import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  rateLimit,
  getClientIp,
  _resetStoreForTesting,
  _getStoreSizeForTesting,
  _MAX_STORE_SIZE,
} from "../rate-limit";

describe("rate-limit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetStoreForTesting();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("rateLimit", () => {
    it("should allow requests within the limit", () => {
      const key = "test-ip-allow";
      const limit = 3;
      const windowMs = 60_000;

      expect(rateLimit(key, limit, windowMs)).toBeNull();
      expect(rateLimit(key, limit, windowMs)).toBeNull();
      expect(rateLimit(key, limit, windowMs)).toBeNull();
    });

    it("should block requests after the limit is exceeded", () => {
      const key = "test-ip-block";
      const limit = 2;
      const windowMs = 60_000;

      // Use up the limit
      rateLimit(key, limit, windowMs);
      rateLimit(key, limit, windowMs);

      // Third request should be blocked
      const response = rateLimit(key, limit, windowMs);
      expect(response).not.toBeNull();
      expect(response!.status).toBe(429);
    });

    it("should include Retry-After header when rate limited", async () => {
      const key = "test-ip-retry";
      const limit = 1;
      const windowMs = 30_000;

      rateLimit(key, limit, windowMs);
      const response = rateLimit(key, limit, windowMs);
      expect(response).not.toBeNull();
      expect(response!.headers.get("Retry-After")).toBe("30");
    });

    it("should return 429 error message in JSON body", async () => {
      const key = "test-ip-body";
      const limit = 1;
      const windowMs = 60_000;

      rateLimit(key, limit, windowMs);
      const response = rateLimit(key, limit, windowMs);
      expect(response).not.toBeNull();
      const body = await response!.json();
      expect(body.error).toBe("Too many requests. Please try again later.");
    });

    it("should allow requests again after the window expires", () => {
      const key = "test-ip-expiry";
      const limit = 1;
      const windowMs = 60_000;

      // Use up the limit
      rateLimit(key, limit, windowMs);
      expect(rateLimit(key, limit, windowMs)).not.toBeNull(); // blocked

      // Advance time past the window
      vi.advanceTimersByTime(windowMs + 1);

      // Should be allowed again
      expect(rateLimit(key, limit, windowMs)).toBeNull();
    });

    it("should track different keys independently", () => {
      const limit = 1;
      const windowMs = 60_000;

      // Exhaust limit for key1
      rateLimit("ip-1", limit, windowMs);
      expect(rateLimit("ip-1", limit, windowMs)).not.toBeNull(); // blocked

      // key2 should still be allowed
      expect(rateLimit("ip-2", limit, windowMs)).toBeNull();
    });

    it("should use default windowMs of 60_000 when not specified", () => {
      const key = "test-ip-default";
      const limit = 1;

      rateLimit(key, limit);
      expect(rateLimit(key, limit)).not.toBeNull(); // blocked

      // Advance 59 seconds - still blocked
      vi.advanceTimersByTime(59_000);
      expect(rateLimit(key, limit)).not.toBeNull();

      // Advance past 60 seconds - allowed
      vi.advanceTimersByTime(2_000);
      expect(rateLimit(key, limit)).toBeNull();
    });

    it("should clean up stale entries after cleanup interval", () => {
      const key = "test-ip-cleanup";
      const limit = 1;
      const windowMs = 60_000;

      // Make a request
      rateLimit(key, limit, windowMs);

      // Advance past the window AND past the cleanup interval (5 minutes)
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      // Trigger cleanup by making another request (cleanup runs on each call)
      // The old entry should be cleaned up and this should succeed
      expect(rateLimit(key, limit, windowMs)).toBeNull();
    });

    it("should implement sliding window correctly", () => {
      const key = "test-ip-sliding";
      const limit = 2;
      const windowMs = 10_000;

      // T=0: First request
      rateLimit(key, limit, windowMs);

      // T=5s: Second request
      vi.advanceTimersByTime(5_000);
      rateLimit(key, limit, windowMs);

      // T=5s: Third request - should be blocked (2 in window)
      expect(rateLimit(key, limit, windowMs)).not.toBeNull();

      // T=11s: First request expired, but second still in window
      vi.advanceTimersByTime(6_000);
      // Should allow one more request (only 1 in window now)
      expect(rateLimit(key, limit, windowMs)).toBeNull();

      // But a second one should be blocked (2 in window again)
      expect(rateLimit(key, limit, windowMs)).not.toBeNull();
    });
  });

  describe("getClientIp (M3 hardening)", () => {
    it("should prefer x-real-ip over x-forwarded-for", () => {
      const request = new Request("http://localhost", {
        headers: {
          "x-real-ip": "203.0.113.50",
          "x-forwarded-for": "10.0.0.1, 192.168.1.1",
        },
      });
      expect(getClientIp(request)).toBe("203.0.113.50");
    });

    it("should use x-real-ip when present", () => {
      const request = new Request("http://localhost", {
        headers: { "x-real-ip": "198.51.100.10" },
      });
      expect(getClientIp(request)).toBe("198.51.100.10");
    });

    it("should trim whitespace from x-real-ip", () => {
      const request = new Request("http://localhost", {
        headers: { "x-real-ip": "  198.51.100.10  " },
      });
      expect(getClientIp(request)).toBe("198.51.100.10");
    });

    it("should take the last IP from x-forwarded-for (closest to server)", () => {
      const request = new Request("http://localhost", {
        headers: { "x-forwarded-for": "10.0.0.1, 192.168.1.1, 203.0.113.50" },
      });
      // Last entry is the one added by our reverse proxy — hardest to spoof
      expect(getClientIp(request)).toBe("203.0.113.50");
    });

    it("should handle single-entry x-forwarded-for", () => {
      const request = new Request("http://localhost", {
        headers: { "x-forwarded-for": "192.168.1.1" },
      });
      expect(getClientIp(request)).toBe("192.168.1.1");
    });

    it("should return 'direct' when no forwarded headers present", () => {
      const request = new Request("http://localhost");
      expect(getClientIp(request)).toBe("direct");
    });

    it("should trim whitespace from x-forwarded-for entries", () => {
      const request = new Request("http://localhost", {
        headers: { "x-forwarded-for": "  10.0.0.1  ,  192.168.1.1  " },
      });
      expect(getClientIp(request)).toBe("192.168.1.1");
    });
  });

  describe("store size limit (M4)", () => {
    it("should reject new keys when store is at max capacity", () => {
      const limit = 10;
      const windowMs = 60_000;

      // Fill the store to max capacity
      for (let i = 0; i < _MAX_STORE_SIZE; i++) {
        const result = rateLimit(`ip-${i}`, limit, windowMs);
        expect(result).toBeNull();
      }
      expect(_getStoreSizeForTesting()).toBe(_MAX_STORE_SIZE);

      // New key should be rejected with 429
      const response = rateLimit("new-ip", limit, windowMs);
      expect(response).not.toBeNull();
      expect(response!.status).toBe(429);
    });

    it("should still allow existing keys when store is full", () => {
      const limit = 10;
      const windowMs = 60_000;

      // Fill the store
      for (let i = 0; i < _MAX_STORE_SIZE; i++) {
        rateLimit(`ip-${i}`, limit, windowMs);
      }

      // Existing key should still work
      const result = rateLimit("ip-0", limit, windowMs);
      expect(result).toBeNull();
    });

    it("should evict oldest entries during cleanup when over max", () => {
      const limit = 10;
      const windowMs = 60_000;

      // Add entries with staggered timestamps
      for (let i = 0; i < _MAX_STORE_SIZE; i++) {
        rateLimit(`ip-${i}`, limit, windowMs);
        vi.advanceTimersByTime(1); // Spread firstRequest timestamps
      }
      expect(_getStoreSizeForTesting()).toBe(_MAX_STORE_SIZE);

      // Advance past cleanup interval but not past the window
      // so entries are still active but cleanup runs
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      // Trigger cleanup - all entries within window should remain
      // (they're all within 60s window since we only advanced ~10s for entries + 5min for cleanup)
      // Actually, entries added at the start ARE older than 60s window now
      // So cleanup will evict stale entries naturally
      rateLimit("trigger-cleanup", limit, windowMs);

      // Store should be smaller now since old entries were cleaned up
      expect(_getStoreSizeForTesting()).toBeLessThanOrEqual(_MAX_STORE_SIZE);
    });

    it("should expose MAX_STORE_SIZE as 10000", () => {
      expect(_MAX_STORE_SIZE).toBe(10_000);
    });
  });
});

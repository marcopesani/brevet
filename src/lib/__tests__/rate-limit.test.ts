import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rateLimit, getClientIp } from "../rate-limit";

describe("rate-limit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
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

  describe("getClientIp", () => {
    it("should extract IP from x-forwarded-for header", () => {
      const request = new Request("http://localhost", {
        headers: { "x-forwarded-for": "192.168.1.1" },
      });
      expect(getClientIp(request)).toBe("192.168.1.1");
    });

    it("should take the first IP from a comma-separated list", () => {
      const request = new Request("http://localhost", {
        headers: { "x-forwarded-for": "10.0.0.1, 192.168.1.1, 172.16.0.1" },
      });
      expect(getClientIp(request)).toBe("10.0.0.1");
    });

    it("should return 'unknown' when no forwarded header", () => {
      const request = new Request("http://localhost");
      expect(getClientIp(request)).toBe("unknown");
    });

    it("should trim whitespace from IP", () => {
      const request = new Request("http://localhost", {
        headers: { "x-forwarded-for": "  192.168.1.1  , 10.0.0.1" },
      });
      expect(getClientIp(request)).toBe("192.168.1.1");
    });
  });
});

import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { proxy, buildCsp, config } from "@/proxy";

const BASE_URL = "http://localhost:3000";

function makeRequest(path: string, cookies?: Record<string, string>): NextRequest {
  const request = new NextRequest(new URL(path, BASE_URL));
  if (cookies) {
    for (const [name, value] of Object.entries(cookies)) {
      request.cookies.set(name, value);
    }
  }
  return request;
}

// ── Security headers (non-CSP) ──────────────────────────────────────────

const SECURITY_HEADERS = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-DNS-Prefetch-Control": "on",
} as const;

function expectSecurityHeaders(response: Response) {
  for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
    expect(response.headers.get(header)).toBe(value);
  }
  expect(response.headers.get("Content-Security-Policy")).toBeTruthy();
}

// ── buildCsp (unit) ─────────────────────────────────────────────────────

describe("buildCsp", () => {
  const csp = buildCsp("test-nonce-123");

  it("injects the nonce into script-src", () => {
    expect(csp).toContain("'nonce-test-nonce-123'");
  });

  it("includes strict-dynamic alongside the nonce", () => {
    expect(csp).toMatch(/script-src[^;]*'nonce-test-nonce-123'[^;]*'strict-dynamic'/);
  });

  it("includes all required base directives", () => {
    for (const directive of [
      "default-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "worker-src 'self' blob:",
    ]) {
      expect(csp).toContain(directive);
    }
  });

  it("includes Reown AppKit wildcard domains", () => {
    for (const wildcard of [
      "*.walletconnect.com",
      "*.walletconnect.org",
      "*.web3modal.com",
      "*.web3modal.org",
      "*.reown.com",
    ]) {
      expect(csp).toContain(wildcard);
    }
  });

  it("includes Reown third-party sources", () => {
    expect(csp).toContain("https://fonts.reown.com");
    expect(csp).toContain("https://fonts.googleapis.com");
    expect(csp).toContain("https://cca-lite.coinbase.com");
  });

  it("includes viem chain RPC URLs in connect-src (from chain-config)", () => {
    expect(csp).toContain("https://mainnet.base.org");
    expect(csp).toContain("https://sepolia.base.org");
  });

  it("produces a different CSP for a different nonce", () => {
    const other = buildCsp("other-nonce");
    expect(other).toContain("'nonce-other-nonce'");
    expect(other).not.toContain("'nonce-test-nonce-123'");
  });
});

// ── proxy (integration) ─────────────────────────────────────────────────

describe("proxy", () => {
  describe("auth redirect — unauthenticated", () => {
    it("redirects /dashboard to /login with 307", () => {
      const response = proxy(makeRequest("/dashboard"));
      expect(response.status).toBe(307);
      expect(new URL(response.headers.get("Location")!).pathname).toBe("/login");
    });

    it("redirects /dashboard/wallet to /login with 307", () => {
      const response = proxy(makeRequest("/dashboard/wallet"));
      expect(response.status).toBe(307);
      expect(new URL(response.headers.get("Location")!).pathname).toBe("/login");
    });

    it("redirects /dashboard/settings to /login with 307", () => {
      const response = proxy(makeRequest("/dashboard/settings"));
      expect(response.status).toBe(307);
      expect(new URL(response.headers.get("Location")!).pathname).toBe("/login");
    });
  });

  describe("auth redirect — authenticated", () => {
    it("passes through /dashboard with next-auth.session-token cookie", () => {
      const response = proxy(makeRequest("/dashboard", {
        "next-auth.session-token": "some-session-value",
      }));
      expect(response.status).not.toBe(307);
      expect(response.headers.get("Location")).toBeNull();
    });

    it("passes through /dashboard with __Secure-next-auth.session-token cookie", () => {
      const response = proxy(makeRequest("/dashboard", {
        "__Secure-next-auth.session-token": "some-session-value",
      }));
      expect(response.status).not.toBe(307);
      expect(response.headers.get("Location")).toBeNull();
    });

    it("includes security headers on authenticated dashboard response", () => {
      const response = proxy(makeRequest("/dashboard", {
        "next-auth.session-token": "some-session-value",
      }));
      expectSecurityHeaders(response);
    });
  });

  describe("non-dashboard routes — pass through", () => {
    it("passes through /login without redirect", () => {
      const response = proxy(makeRequest("/login"));
      expect(response.status).not.toBe(307);
      expect(response.headers.get("Location")).toBeNull();
    });

    it("passes through / (marketing page) without redirect", () => {
      const response = proxy(makeRequest("/"));
      expect(response.status).not.toBe(307);
      expect(response.headers.get("Location")).toBeNull();
    });
  });

  describe("security headers", () => {
    it.each(["/login", "/", "/some-page"])("applies all headers on %s", (path) => {
      expectSecurityHeaders(proxy(makeRequest(path)));
    });

    it("applies headers on authenticated /dashboard", () => {
      expectSecurityHeaders(proxy(makeRequest("/dashboard", {
        "next-auth.session-token": "session-value",
      })));
    });

    it("applies headers on redirect responses", () => {
      const response = proxy(makeRequest("/dashboard"));
      expect(response.status).toBe(307);
      expectSecurityHeaders(response);
    });
  });

  describe("nonce", () => {
    it("generates a unique nonce per request", () => {
      const csp1 = proxy(makeRequest("/")).headers.get("Content-Security-Policy")!;
      const csp2 = proxy(makeRequest("/")).headers.get("Content-Security-Policy")!;

      const nonce1 = csp1.match(/'nonce-([A-Za-z0-9+/=]+)'/)?.[1];
      const nonce2 = csp2.match(/'nonce-([A-Za-z0-9+/=]+)'/)?.[1];
      expect(nonce1).toBeDefined();
      expect(nonce2).toBeDefined();
      expect(nonce1).not.toBe(nonce2);
    });
  });
});

// ── config matcher ──────────────────────────────────────────────────────

describe("config matcher", () => {
  function matcherSource(): string {
    return config.matcher
      .map((m) => (typeof m === "string" ? m : m.source))
      .join(" ");
  }

  it("exports a non-empty matcher array", () => {
    expect(Array.isArray(config.matcher)).toBe(true);
    expect(config.matcher.length).toBeGreaterThan(0);
  });

  it.each(["api", "_next", "ico"])("excludes %s paths", (token) => {
    expect(matcherSource()).toContain(token);
  });

  it("skips prefetch requests via missing headers", () => {
    const obj = config.matcher[0] as { missing: { key: string }[] };
    const keys = obj.missing.map((m) => m.key);
    expect(keys).toContain("next-router-prefetch");
    expect(keys).toContain("purpose");
  });
});

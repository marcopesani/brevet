import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { proxy, config } from "@/proxy";

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
  const csp = response.headers.get("Content-Security-Policy");
  expect(csp).toBeTruthy();
}

describe("proxy", () => {
  describe("auth redirect — unauthenticated", () => {
    it("redirects /dashboard to /login with 307", () => {
      const request = makeRequest("/dashboard");
      const response = proxy(request);

      expect(response.status).toBe(307);
      expect(new URL(response.headers.get("Location")!).pathname).toBe("/login");
    });

    it("redirects /dashboard/wallet to /login with 307", () => {
      const request = makeRequest("/dashboard/wallet");
      const response = proxy(request);

      expect(response.status).toBe(307);
      expect(new URL(response.headers.get("Location")!).pathname).toBe("/login");
    });

    it("redirects /dashboard/settings to /login with 307", () => {
      const request = makeRequest("/dashboard/settings");
      const response = proxy(request);

      expect(response.status).toBe(307);
      expect(new URL(response.headers.get("Location")!).pathname).toBe("/login");
    });
  });

  describe("auth redirect — authenticated", () => {
    it("passes through /dashboard with next-auth.session-token cookie", () => {
      const request = makeRequest("/dashboard", {
        "next-auth.session-token": "some-session-value",
      });
      const response = proxy(request);

      expect(response.status).not.toBe(307);
      expect(response.headers.get("Location")).toBeNull();
    });

    it("passes through /dashboard with __Secure-next-auth.session-token cookie", () => {
      const request = makeRequest("/dashboard", {
        "__Secure-next-auth.session-token": "some-session-value",
      });
      const response = proxy(request);

      expect(response.status).not.toBe(307);
      expect(response.headers.get("Location")).toBeNull();
    });

    it("includes security headers on authenticated dashboard response", () => {
      const request = makeRequest("/dashboard", {
        "next-auth.session-token": "some-session-value",
      });
      const response = proxy(request);

      expectSecurityHeaders(response);
    });
  });

  describe("non-dashboard routes — pass through", () => {
    it("passes through /login without redirect", () => {
      const request = makeRequest("/login");
      const response = proxy(request);

      expect(response.status).not.toBe(307);
      expect(response.headers.get("Location")).toBeNull();
    });

    it("passes through / (marketing page) without redirect", () => {
      const request = makeRequest("/");
      const response = proxy(request);

      expect(response.status).not.toBe(307);
      expect(response.headers.get("Location")).toBeNull();
    });
  });

  describe("security headers", () => {
    it("includes all security headers on /login response", () => {
      const request = makeRequest("/login");
      const response = proxy(request);

      expectSecurityHeaders(response);
    });

    it("includes all security headers on / response", () => {
      const request = makeRequest("/");
      const response = proxy(request);

      expectSecurityHeaders(response);
    });

    it("includes all security headers on authenticated /dashboard response", () => {
      const request = makeRequest("/dashboard", {
        "next-auth.session-token": "session-value",
      });
      const response = proxy(request);

      expectSecurityHeaders(response);
    });

    it("includes security headers on redirect responses", () => {
      const request = makeRequest("/dashboard");
      const response = proxy(request);

      expect(response.status).toBe(307);
      expectSecurityHeaders(response);
    });
  });

  describe("nonce-based CSP", () => {
    it("includes a nonce in the CSP script-src directive", () => {
      const request = makeRequest("/login");
      const response = proxy(request);
      const csp = response.headers.get("Content-Security-Policy")!;

      expect(csp).toMatch(/script-src[^;]*'nonce-[A-Za-z0-9+/=]+'[^;]*'strict-dynamic'/);
    });

    it("generates a unique nonce per request", () => {
      const r1 = proxy(makeRequest("/login"));
      const r2 = proxy(makeRequest("/login"));
      const csp1 = r1.headers.get("Content-Security-Policy")!;
      const csp2 = r2.headers.get("Content-Security-Policy")!;

      const nonce1 = csp1.match(/'nonce-([A-Za-z0-9+/=]+)'/)?.[1];
      const nonce2 = csp2.match(/'nonce-([A-Za-z0-9+/=]+)'/)?.[1];
      expect(nonce1).toBeDefined();
      expect(nonce2).toBeDefined();
      expect(nonce1).not.toBe(nonce2);
    });

    it("includes required CSP directives", () => {
      const request = makeRequest("/");
      const response = proxy(request);
      const csp = response.headers.get("Content-Security-Policy")!;

      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
    });

    it("includes Reown AppKit wildcard domains per official CSP guide", () => {
      const request = makeRequest("/");
      const response = proxy(request);
      const csp = response.headers.get("Content-Security-Policy")!;

      expect(csp).toContain("*.walletconnect.com");
      expect(csp).toContain("*.walletconnect.org");
      expect(csp).toContain("*.web3modal.com");
      expect(csp).toContain("*.web3modal.org");
      expect(csp).toContain("*.reown.com");
      expect(csp).toContain("https://fonts.reown.com");
    });
  });

  describe("config matcher", () => {
    function getMatcherSourceString(
      matcher: (string | { source: string; missing?: unknown[] })[]
    ): string {
      return matcher
        .map((m) => (typeof m === "string" ? m : m.source))
        .join(" ");
    }

    it("exports a config object with a matcher array", () => {
      expect(config).toBeDefined();
      expect(config.matcher).toBeDefined();
      expect(Array.isArray(config.matcher)).toBe(true);
      expect(config.matcher.length).toBeGreaterThan(0);
    });

    it("excludes /api paths", () => {
      const matcherStr = getMatcherSourceString(config.matcher);
      expect(matcherStr).toContain("api");
    });

    it("excludes /_next paths", () => {
      const matcherStr = getMatcherSourceString(config.matcher);
      expect(matcherStr).toContain("_next");
    });

    it("excludes static file extensions", () => {
      const matcherStr = getMatcherSourceString(config.matcher);
      expect(matcherStr).toMatch(/ico|svg|png|jpg/);
    });

    it("skips prefetch requests via missing headers", () => {
      const matcher = config.matcher[0];
      expect(typeof matcher).toBe("object");
      const obj = matcher as { source: string; missing: { type: string; key: string }[] };
      const keys = obj.missing.map((m) => m.key);
      expect(keys).toContain("next-router-prefetch");
      expect(keys).toContain("purpose");
    });
  });
});

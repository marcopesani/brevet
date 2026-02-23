/**
 * Next.js 16 Proxy: auth redirects + security headers with nonce-based CSP.
 *
 * CSP is built declaratively from layered source maps (base, Reown, Vercel
 * preview, dev). Each layer contributes sources per directive; layers are
 * merged at startup and the per-request nonce is injected at runtime.
 *
 * @see https://nextjs.org/docs/app/getting-started/proxy
 * @see https://nextjs.org/docs/app/guides/content-security-policy
 * @see https://docs.reown.com/advanced/security/content-security-policy
 * @see https://vercel.com/docs/workflow-collaboration/vercel-toolbar/managing-toolbar#using-a-content-security-policy
 */
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Environment flags
// ---------------------------------------------------------------------------

const isDev = process.env.NODE_ENV === "development";
const isVercelPreview = process.env.VERCEL_ENV === "preview";

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

const SESSION_COOKIE_NAMES = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name));
}

// ---------------------------------------------------------------------------
// CSP — declarative source layers
// ---------------------------------------------------------------------------

type CspSources = Record<string, string[]>;

const WC = "*.walletconnect.com *.walletconnect.org *.web3modal.com *.web3modal.org *.reown.com";

const BASE_SOURCES: CspSources = {
  "default-src":      ["'self'"],
  "script-src":       ["'self'", "'strict-dynamic'", "blob:"],
  "style-src":        ["'self'", "'unsafe-inline'"],
  "img-src":          ["'self'", "data:", "blob:"],
  "font-src":         ["'self'"],
  "connect-src":      ["'self'", "wss:"],
  "frame-src":        ["'self'"],
  "worker-src":       ["'self'", "blob:"],
  "object-src":       ["'none'"],
  "base-uri":         ["'self'"],
  "form-action":      ["'self'"],
  "frame-ancestors":  ["'none'"],
};

const REOWN_SOURCES: CspSources = {
  "style-src":    ["https://fonts.googleapis.com"],
  "img-src":      [WC, "https://tokens-data.1inch.io", "https://tokens.1inch.io", "https://ipfs.io", "https://cdn.zerion.io"],
  "font-src":     ["https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://fonts.reown.com"],
  "connect-src":  [WC, "wss://www.walletlink.org", "https://cca-lite.coinbase.com"],
  "frame-src":    [WC],
};

const VERCEL_PREVIEW_SOURCES: CspSources = {
  "script-src":   ["https://vercel.live"],
  "style-src":    ["https://vercel.live"],
  "img-src":      ["https://vercel.live", "https://vercel.com"],
  "font-src":     ["https://vercel.live", "https://assets.vercel.com"],
  "connect-src":  ["https://vercel.live", "wss://ws-us3.pusher.com"],
  "frame-src":    ["https://vercel.live"],
};

const DEV_SOURCES: CspSources = {
  "script-src": ["'unsafe-eval'"],
};

// ---------------------------------------------------------------------------
// CSP — merge & build
// ---------------------------------------------------------------------------

function mergeCspSources(...layers: CspSources[]): CspSources {
  const merged: CspSources = {};
  for (const layer of layers) {
    for (const [directive, sources] of Object.entries(layer)) {
      (merged[directive] ??= []).push(...sources);
    }
  }
  return merged;
}

const activeLayers: CspSources[] = [
  BASE_SOURCES,
  REOWN_SOURCES,
  ...(isVercelPreview ? [VERCEL_PREVIEW_SOURCES] : []),
  ...(isDev ? [DEV_SOURCES] : []),
];

const mergedSources = mergeCspSources(...activeLayers);

export function buildCsp(nonce: string): string {
  const withNonce: CspSources = {
    ...mergedSources,
    "script-src": [`'nonce-${nonce}'`, ...mergedSources["script-src"]],
  };

  return Object.entries(withNonce)
    .map(([directive, sources]) => `${directive} ${sources.join(" ")}`)
    .join("; ");
}

// ---------------------------------------------------------------------------
// Security headers (non-CSP)
// ---------------------------------------------------------------------------

const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options":            "DENY",
  "X-Content-Type-Options":     "nosniff",
  "Referrer-Policy":            "strict-origin-when-cross-origin",
  "Permissions-Policy":         "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security":  "max-age=63072000; includeSubDomains; preload",
  "X-DNS-Prefetch-Control":     "on",
};

function applyHeaders(response: NextResponse, csp: string): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

// ---------------------------------------------------------------------------
// Proxy entry point
// ---------------------------------------------------------------------------

export function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  const { pathname } = request.nextUrl;

  if (
    (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) &&
    !hasSessionCookie(request)
  ) {
    const loginUrl = new URL("/login", request.url);
    return applyHeaders(NextResponse.redirect(loginUrl, 307), csp);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  return applyHeaders(response, csp);
}

// ---------------------------------------------------------------------------
// Matcher
// ---------------------------------------------------------------------------

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

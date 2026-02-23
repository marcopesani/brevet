/**
 * Next.js 16 Proxy: auth redirects + security headers with nonce-based CSP.
 *
 * Nonces allow Next.js inline scripts (hydration, etc.) to execute under a
 * strict CSP without 'unsafe-inline'. Next.js automatically attaches the nonce
 * to framework scripts, page bundles, and <Script> components.
 *
 * @see https://nextjs.org/docs/app/getting-started/proxy
 * @see https://nextjs.org/docs/app/guides/content-security-policy
 */
import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE_NAMES = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

const isDev = process.env.NODE_ENV === "development";
const isVercelPreview = process.env.VERCEL_ENV === "preview";

/**
 * Wildcard domains for Reown AppKit / WalletConnect services.
 * Third-party origins (Coinbase, 1inch, Zerion, IPFS, Google Fonts) are
 * listed explicitly because they fall outside the WalletConnect umbrella.
 * @see https://docs.reown.com/advanced/security/content-security-policy
 */
const WC_WILDCARDS = "*.walletconnect.com *.walletconnect.org *.web3modal.com *.web3modal.org *.reown.com";

function buildCsp(nonce: string): string {
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    "blob:",
    ...(isDev ? ["'unsafe-eval'"] : []),
    ...(isVercelPreview ? ["https://vercel.live"] : []),
  ].join(" ");

  const vercelPreview = isVercelPreview ? " https://vercel.live" : "";

  const directives: string[] = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `img-src 'self' data: blob: ${WC_WILDCARDS} https://tokens-data.1inch.io https://tokens.1inch.io https://ipfs.io https://cdn.zerion.io`,
    `font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com https://fonts.reown.com`,
    `connect-src 'self' ${WC_WILDCARDS} wss: wss://www.walletlink.org https://cca-lite.coinbase.com`,
    `frame-src 'self' ${WC_WILDCARDS}${vercelPreview}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  return directives.join("; ");
}

function addSecurityHeaders(
  request: NextRequest,
  response: NextResponse,
  csp: string,
  nonce: string,
): NextResponse {
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", csp);

  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set(
    "Referrer-Policy",
    "strict-origin-when-cross-origin",
  );
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload",
  );
  response.headers.set("X-DNS-Prefetch-Control", "on");
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name));
}

export function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  const { pathname } = request.nextUrl;

  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    if (!hasSessionCookie(request)) {
      const loginUrl = new URL("/login", request.url);
      const response = NextResponse.redirect(loginUrl, 307);
      return addSecurityHeaders(request, response, csp, nonce);
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  return addSecurityHeaders(request, response, csp, nonce);
}

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

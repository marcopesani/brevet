/**
 * Next.js 16 Proxy: auth redirects + security headers (including CSP).
 * Convention: proxy.ts at project root or in src/ (same level as app/).
 * @see https://nextjs.org/docs/app/getting-started/proxy
 * @see https://nextjs.org/docs/app/guides/content-security-policy
 */
import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE_NAMES = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

const isDev = process.env.NODE_ENV === "development";

function buildCsp(): string {
  const scriptSrc = [
    "'self'",
    "*.walletconnect.com",
    "*.reown.com",
    "blob:",
    ...(isDev
      ? ["'unsafe-eval'", "'unsafe-inline'", "https://vercel.live"]
      : []),
  ].join(" ");
  const directives: string[] = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: *.walletconnect.com *.reown.com",
    "font-src 'self'",
    "connect-src 'self' *.walletconnect.com *.walletconnect.org *.reown.com wss:",
    "frame-src 'self' *.walletconnect.com *.reown.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  return directives.join("; ");
}

const csp = buildCsp();

function addSecurityHeaders(response: NextResponse): NextResponse {
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
  const { pathname } = request.nextUrl;

  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    if (!hasSessionCookie(request)) {
      const loginUrl = new URL("/login", request.url);
      return addSecurityHeaders(NextResponse.redirect(loginUrl, 307));
    }
  }

  return addSecurityHeaders(NextResponse.next());
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

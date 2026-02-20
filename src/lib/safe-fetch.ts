/**
 * Shared SSRF-safe fetch utility.
 *
 * Validates URLs against private/internal IP ranges and follows redirects
 * manually, re-validating each redirect target. Used by both the MCP payment
 * flow and the dashboard approve-payment server action.
 */

/**
 * Check if an IPv4 address (given as four octets) is private, loopback, or internal.
 */
function isPrivateIpv4(a: number, b: number): boolean {
  return (
    a === 127 ||                         // 127.0.0.0/8 (loopback)
    a === 10 ||                          // 10.0.0.0/8
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) ||          // 192.168.0.0/16
    (a === 169 && b === 254) ||          // 169.254.0.0/16 (link-local)
    a === 0                              // 0.0.0.0/8
  );
}

/**
 * Check an IPv6 hostname for dangerous addresses: loopback (::1), unspecified (::),
 * link-local (fe80::/10), and IPv6-mapped IPv4 (::ffff:x.x.x.x) that embed private IPs.
 * Returns an error string if blocked, or null if safe.
 *
 * Note: Node's URL parser may keep brackets on IPv6 hostnames (e.g., "[::1]") and
 * normalizes dotted IPv4-mapped addresses to hex form (e.g., ::ffff:127.0.0.1 → ::ffff:7f00:1).
 */
function checkIpv6Address(hostname: string): string | null {
  // Only process if it looks like an IPv6 address (may have brackets from URL parser)
  if (!hostname.includes(":")) return null;

  // Strip brackets if present (URL parser keeps them on IPv6 hostnames)
  const bare = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  const lower = bare.toLowerCase();

  // Loopback ::1
  if (lower === "::1") {
    return "Requests to localhost/loopback addresses are not allowed";
  }

  // Unspecified address ::
  if (lower === "::") {
    return "Requests to unspecified addresses are not allowed";
  }

  // Link-local fe80::/10
  if (lower.startsWith("fe80:") || lower.startsWith("fe80%")) {
    return "Requests to link-local IPv6 addresses are not allowed";
  }

  // IPv6-mapped IPv4: ::ffff:a.b.c.d (dotted form — may appear in user input or raw URLs)
  const mappedDottedMatch = lower.match(/^::ffff:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (mappedDottedMatch) {
    const [, a, b] = mappedDottedMatch.map(Number);
    if (isPrivateIpv4(a, b)) {
      return "Requests to private/internal IP addresses are not allowed";
    }
  }

  // IPv6-mapped IPv4 in hex form: ::ffff:7f00:1 (Node's URL parser normalizes to this)
  const mappedHexMatch = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHexMatch) {
    const hi = parseInt(mappedHexMatch[1], 16);
    const lo = parseInt(mappedHexMatch[2], 16);
    const a = (hi >> 8) & 0xff;
    const b = hi & 0xff;
    if (isPrivateIpv4(a, b)) {
      return "Requests to private/internal IP addresses are not allowed";
    }
    // Also check if the full IP resolves to 0.0.0.0
    if (hi === 0 && lo === 0) {
      return "Requests to private/internal IP addresses are not allowed";
    }
  }

  return null;
}

/**
 * Validate a URL before making an HTTP request.
 * Rejects non-http(s) protocols, private/internal IPs, and malformed URLs.
 */
export function validateUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "Invalid URL format";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return `Unsupported protocol: ${parsed.protocol} (only http and https are allowed)`;
  }

  const hostname = parsed.hostname;

  // Reject localhost and loopback
  if (
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname === "0.0.0.0"
  ) {
    return "Requests to localhost/loopback addresses are not allowed";
  }

  // Reject private/internal IPv4 ranges (includes full 127.0.0.0/8 loopback)
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (isPrivateIpv4(a, b)) {
      return "Requests to private/internal IP addresses are not allowed";
    }
  }

  // Reject IPv6 addresses that map to private/loopback IPv4 (H1)
  // URL parser may keep brackets on IPv6 hostnames — checkIpv6Address handles both forms
  const ipv6Error = checkIpv6Address(hostname);
  if (ipv6Error) {
    return ipv6Error;
  }

  // Reject common internal hostnames
  if (
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".localhost")
  ) {
    return "Requests to internal hostnames are not allowed";
  }

  return null;
}

/**
 * Maximum number of redirects to follow before aborting.
 * Prevents infinite redirect loops and limits redirect-chain SSRF attacks.
 */
const MAX_REDIRECTS = 5;

/**
 * Fetch a URL with redirect: "manual" and validate each redirect Location
 * through validateUrl() before following it. This prevents redirect-based SSRF
 * where an external URL (e.g., https://evil.com) redirects to an internal IP
 * (e.g., http://169.254.169.254/). Limits redirect depth to MAX_REDIRECTS.
 *
 * NOTE: Production deployments should also use DNS-level rebinding protection
 * (e.g., Cloudflare Gateway, dnsmasq rebind-protection) to defend against DNS
 * rebinding attacks where a domain alternates between public and private IPs (M1).
 */
/** Timeout for outbound fetch calls (M8). */
const FETCH_TIMEOUT_MS = 30_000;

export async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  let currentUrl = url;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const response = await fetch(currentUrl, {
      ...init,
      redirect: "manual",
      signal: init?.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    // If not a redirect, return the response as-is
    if (response.status < 300 || response.status >= 400) {
      return response;
    }

    // Handle redirect
    const location = response.headers.get("location");
    if (!location) {
      return response; // No Location header — return the redirect response
    }

    // Resolve relative redirect URLs against the current URL
    const resolvedUrl = new URL(location, currentUrl).toString();

    // Validate the redirect target for SSRF (H3)
    const redirectError = validateUrl(resolvedUrl);
    if (redirectError) {
      throw new Error(`Redirect blocked: ${redirectError} (redirected to ${resolvedUrl})`);
    }

    currentUrl = resolvedUrl;
  }

  throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
}

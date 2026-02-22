import { after } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/mcp/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getUserByApiKey } from "@/lib/data/users";

/**
 * Extract API key from the request.
 * Priority: Authorization: Bearer header > api_key query parameter.
 */
function extractApiKey(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match) {
      return match[1];
    }
  }

  const url = new URL(request.url);
  const queryKey = url.searchParams.get("api_key");
  if (queryKey) {
    return queryKey;
  }

  return null;
}

// Stateless: create a fresh server + transport per request
async function handleMcpRequest(
  request: Request,
): Promise<Response> {
  const startTime = performance.now();
  const method = request.method;
  const ip = getClientIp(request);

  // Mutable context populated as the request progresses
  const logContext: {
    userId?: string;
    status?: number;
    error?: string;
  } = {};

  // Register after() before any early returns so all paths are logged.
  // The callback runs after the response is sent to the client.
  after(() => {
    const durationMs = Math.round(performance.now() - startTime);
    console.log(
      JSON.stringify({
        event: "mcp_request",
        method,
        ip,
        userId: logContext.userId ?? null,
        status: logContext.status ?? null,
        error: logContext.error ?? null,
        durationMs,
      }),
    );
  });

  // IP-based rate limiting
  const ipLimited = rateLimit(ip, 60);
  if (ipLimited) {
    logContext.status = 429;
    logContext.error = "ip_rate_limited";
    return ipLimited;
  }

  // Extract and validate API key
  const apiKey = extractApiKey(request);
  if (!apiKey) {
    logContext.status = 401;
    logContext.error = "missing_api_key";
    return new Response(
      JSON.stringify({
        error: "API key required",
        hint: "Pass via Authorization: Bearer <key> header or ?api_key=<key> query parameter",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  // Look up user by API key
  const result = await getUserByApiKey(apiKey);
  if (!result) {
    logContext.status = 401;
    logContext.error = "invalid_api_key";
    return new Response(
      JSON.stringify({ error: "Invalid API key" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const { userId } = result;
  logContext.userId = userId;

  // API key rate limiting (after validation, keyed by userId)
  const keyLimited = rateLimit(`apikey:${userId}`, 60);
  if (keyLimited) {
    logContext.status = 429;
    logContext.error = "apikey_rate_limited";
    return keyLimited;
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
  });

  const server = createMcpServer(userId);
  await server.connect(transport);

  logContext.status = 200;
  return transport.handleRequest(request);
}

export async function GET(request: Request) {
  return handleMcpRequest(request);
}

export async function POST(request: Request) {
  return handleMcpRequest(request);
}

export async function DELETE(request: Request) {
  return handleMcpRequest(request);
}

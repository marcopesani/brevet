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
  // IP-based rate limiting
  const ipLimited = rateLimit(getClientIp(request), 60);
  if (ipLimited) return ipLimited;

  // Extract and validate API key
  const apiKey = extractApiKey(request);
  if (!apiKey) {
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
    return new Response(
      JSON.stringify({ error: "Invalid API key" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const { userId } = result;

  // API key rate limiting (after validation, keyed by userId)
  const keyLimited = rateLimit(`apikey:${userId}`, 60);
  if (keyLimited) return keyLimited;

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
  });

  const server = createMcpServer(userId);
  await server.connect(transport);

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

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/mcp/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getAuthenticatedUser } from "@/lib/auth";

// TODO: The MCP endpoint is consumed by headless AI agents that cannot use browser-based
// sessions. A token-based auth strategy (e.g., API keys or service tokens) is
// needed for production use. For now, we validate the session if present and
// verify it matches the [userId] URL parameter.

// Stateless: create a fresh server + transport per request
async function handleMcpRequest(
  request: Request,
): Promise<Response> {
  const limited = rateLimit(getClientIp(request), 60);
  if (limited) return limited;
  const url = new URL(request.url);
  const userId = url.pathname.split("/").at(-1);

  if (!userId) {
    return new Response(JSON.stringify({ error: "userId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Validate session if present — ensure the authenticated user matches the URL param
  const auth = await getAuthenticatedUser();
  if (auth && auth.userId !== userId) {
    return new Response(JSON.stringify({ error: "Forbidden: userId mismatch" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

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

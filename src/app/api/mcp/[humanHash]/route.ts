import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/mcp/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { findByHumanHash } from "@/lib/data/wallet";
import { connectDB } from "@/lib/db";
// The MCP endpoint is consumed by headless AI agents. The [humanHash] in the
// URL path acts as the API key / identifier for access.

// Stateless: create a fresh server + transport per request
async function handleMcpRequest(
  request: Request,
): Promise<Response> {
  const limited = rateLimit(getClientIp(request), 60);
  if (limited) return limited;
  const url = new URL(request.url);
  const humanHashParam = url.pathname.split("/").at(-1);

  if (!humanHashParam) {
    return new Response(JSON.stringify({ error: "humanHash is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  await connectDB();
  const userId = await findByHumanHash(humanHashParam);

  if (!userId) {
    return new Response(JSON.stringify({ error: "User not found" }), {
      status: 404,
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

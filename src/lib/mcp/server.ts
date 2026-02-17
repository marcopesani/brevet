import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { baseURL } from "@/../baseUrl";
import { registerTools, WALLET_RESOURCE_URI } from "./tools";

async function fetchPageHtml(
  path: string,
  vercelBypassToken?: string,
): Promise<string> {
  const url = new URL(path, baseURL);
  if (vercelBypassToken) {
    url.searchParams.set("x-vercel-protection-bypass", vercelBypassToken);
  }
  const res = await fetch(url);
  return res.text();
}

export function createMcpServer(
  userId: string,
  options?: { vercelBypassToken?: string },
): McpServer {
  const server = new McpServer({
    name: "pay-mcp",
    version: "0.1.0",
  });

  registerTools(server, userId);

  registerAppResource(
    server,
    "x402-wallet-widget",
    WALLET_RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => {
      const html = await fetchPageHtml(
        "/mcp-apps/wallet",
        options?.vercelBypassToken,
      );
      return {
        contents: [
          {
            uri: WALLET_RESOURCE_URI,
            mimeType: RESOURCE_MIME_TYPE,
            text: html,
            _meta: {
              ui: {
                csp: {
                  connectDomains: [baseURL],
                  resourceDomains: [baseURL],
                },
              },
            },
          },
        ],
      };
    },
  );

  return server;
}

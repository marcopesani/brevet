import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { registerTools } from "./tools";
import fs from "node:fs";
import path from "node:path";

const DEMO_WALLETCONNECT_RESOURCE_URI = "ui://demo-walletconnect/demo-walletconnect.html";

export function createMcpServer(userId: string): McpServer {
  const server = new McpServer({
    name: "pay-mcp",
    version: "0.1.0",
  });

  registerTools(server, userId);

  // Register MCP App UI resource for demo_walletconnect
  registerAppResource(
    server,
    "demo-walletconnect",
    DEMO_WALLETCONNECT_RESOURCE_URI,
    {},
    async () => {
      const html = fs.readFileSync(
        path.join(process.cwd(), "dist-mcp-app", "src", "mcp-app", "demo-walletconnect.html"),
        "utf-8",
      );
      return {
        contents: [
          {
            uri: DEMO_WALLETCONNECT_RESOURCE_URI,
            mimeType: RESOURCE_MIME_TYPE,
            text: html,
          },
        ],
      };
    },
  );

  return server;
}

export { DEMO_WALLETCONNECT_RESOURCE_URI };

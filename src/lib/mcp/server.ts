import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools";

export function createMcpServer(userId: string): McpServer {
  const server = new McpServer({
    name: "brevet",
    version: "0.1.0",
  });

  registerTools(server, userId);

  return server;
}

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerX402Pay } from "./tools/x402-pay";
import { registerX402CheckBalance } from "./tools/x402-check-balance";
import { registerX402SpendingHistory } from "./tools/x402-spending-history";
import { registerX402CheckPending } from "./tools/x402-check-pending";
import { registerX402GetResult } from "./tools/x402-get-result";
import { registerX402Discover } from "./tools/x402-discover";
import { MCP_TOOL_NAMES } from "./tool-registry";

export function registerTools(server: McpServer, userId: string): void {
  registerX402Pay(server, userId);
  registerX402CheckBalance(server, userId);
  registerX402SpendingHistory(server, userId);
  registerX402CheckPending(server, userId);
  registerX402GetResult(server, userId);
  registerX402Discover(server, userId);

  // Runtime assertion: verify every tool in the registry was actually registered
  // Only runs when using the real McpServer SDK (not mock servers in tests)
  const registeredTools = (
    server as unknown as { _registeredTools?: Record<string, unknown> }
  )._registeredTools;

  if (registeredTools) {
    const registeredNames = new Set(Object.keys(registeredTools));
    for (const name of MCP_TOOL_NAMES) {
      if (!registeredNames.has(name)) {
        throw new Error(
          `MCP tool registry/implementation mismatch: "${name}" is in the registry but was not registered on the server`,
        );
      }
    }
  }
}

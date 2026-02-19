import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerX402Pay } from "./tools/x402-pay";
import { registerX402CheckBalance } from "./tools/x402-check-balance";
import { registerX402SpendingHistory } from "./tools/x402-spending-history";
import { registerX402CheckPending } from "./tools/x402-check-pending";
import { registerX402GetResult } from "./tools/x402-get-result";
import { registerX402Discover } from "./tools/x402-discover";

export function registerTools(server: McpServer, userId: string): void {
  registerX402Pay(server, userId);
  registerX402CheckBalance(server, userId);
  registerX402SpendingHistory(server, userId);
  registerX402CheckPending(server, userId);
  registerX402GetResult(server, userId);
  registerX402Discover(server, userId);
}

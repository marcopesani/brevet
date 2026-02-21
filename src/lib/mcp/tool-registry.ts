export interface McpToolDescriptor {
  name: string;
  summary: string;
}

export const MCP_TOOLS = [
  { name: "x402_pay", summary: "Make payments to x402-protected APIs" },
  {
    name: "x402_check_balance",
    summary: "Check smart account USDC balance",
  },
  {
    name: "x402_spending_history",
    summary: "Query transaction history",
  },
  {
    name: "x402_check_pending",
    summary: "Check pending payment status",
  },
  {
    name: "x402_get_result",
    summary: "Retrieve completed payment results",
  },
  {
    name: "x402_discover",
    summary: "Search for available x402 endpoints",
  },
] as const satisfies readonly McpToolDescriptor[];

export const MCP_TOOL_NAMES = MCP_TOOLS.map((t) => t.name);

/**
 * Pure utility functions for generating MCP client deeplinks and config snippets.
 * Used by the onboarding "Install MCP Server" step.
 */

export type McpClientId =
  | "cursor"
  | "vscode"
  | "claude-code"
  | "claude-desktop"
  | "chatgpt"
  | "windsurf"
  | "universal";

export interface McpClientConfig {
  id: McpClientId;
  name: string;
  /** Whether this client supports a one-click deeplink install. */
  hasDeeplink: boolean;
}

export const MCP_CLIENTS: McpClientConfig[] = [
  { id: "cursor", name: "Cursor", hasDeeplink: true },
  { id: "vscode", name: "VS Code", hasDeeplink: true },
  { id: "claude-code", name: "Claude Code", hasDeeplink: false },
  { id: "claude-desktop", name: "Claude Desktop", hasDeeplink: false },
  { id: "chatgpt", name: "ChatGPT", hasDeeplink: false },
  { id: "windsurf", name: "Windsurf", hasDeeplink: false },
  { id: "universal", name: "Universal (npx)", hasDeeplink: false },
];

/**
 * Build the JSON config object used by MCP-compatible clients.
 * This is the canonical shape shared across Cursor, VS Code, Claude Desktop,
 * and Windsurf configs.
 */
function buildMcpServerConfig(mcpUrl: string, apiKey: string) {
  return {
    brevet: {
      url: mcpUrl,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  };
}

/**
 * Generate a one-click deeplink for Cursor.
 * Format: cursor://anysphere.cursor.code/mcp/install?url=<encoded>&name=brevet&headers=<encoded>
 */
export function getCursorDeeplink(mcpUrl: string, apiKey: string): string {
  const headers = JSON.stringify({ Authorization: `Bearer ${apiKey}` });
  const params = new URLSearchParams({
    url: mcpUrl,
    name: "brevet",
    headers,
  });
  return `cursor://anysphere.cursor.code/mcp/install?${params.toString()}`;
}

/**
 * Generate a one-click deeplink for VS Code.
 * Format: vscode://modelcontextprotocol.mcp/install?url=<encoded>&name=brevet&headers=<encoded>
 */
export function getVSCodeDeeplink(mcpUrl: string, apiKey: string): string {
  const headers = JSON.stringify({ Authorization: `Bearer ${apiKey}` });
  const params = new URLSearchParams({
    url: mcpUrl,
    name: "brevet",
    headers,
  });
  return `vscode://modelcontextprotocol.mcp/install?${params.toString()}`;
}

/**
 * Generate the Claude Code CLI command for adding the MCP server.
 */
export function getClaudeCodeCommand(mcpUrl: string, apiKey: string): string {
  return `claude mcp add brevet --transport http "${mcpUrl}" --header "Authorization: Bearer ${apiKey}"`;
}

/**
 * Get the JSON config snippet for Claude Desktop.
 * Returned as a formatted JSON string.
 */
export function getClaudeDesktopConfig(
  mcpUrl: string,
  apiKey: string
): string {
  const config = { mcpServers: buildMcpServerConfig(mcpUrl, apiKey) };
  return JSON.stringify(config, null, 2);
}

/**
 * Get the OS-specific config file path for Claude Desktop.
 */
export function getClaudeDesktopConfigPath(os: "mac" | "windows" | "linux"): string {
  switch (os) {
    case "mac":
      return "~/Library/Application Support/Claude/claude_desktop_config.json";
    case "windows":
      return "%APPDATA%\\Claude\\claude_desktop_config.json";
    case "linux":
      return "~/.config/Claude/claude_desktop_config.json";
  }
}

/**
 * Get the JSON config snippet for Windsurf.
 * Returned as a formatted JSON string.
 */
export function getWindsurfConfig(mcpUrl: string, apiKey: string): string {
  const config = { mcpServers: buildMcpServerConfig(mcpUrl, apiKey) };
  return JSON.stringify(config, null, 2);
}

/**
 * Get the OS-specific config file path for Windsurf.
 */
export function getWindsurfConfigPath(os: "mac" | "windows" | "linux"): string {
  switch (os) {
    case "mac":
      return "~/.codeium/windsurf/mcp_config.json";
    case "windows":
      return "%USERPROFILE%\\.codeium\\windsurf\\mcp_config.json";
    case "linux":
      return "~/.codeium/windsurf/mcp_config.json";
  }
}

/**
 * Generate the `npx add-mcp` command for universal installation.
 */
export function getUniversalCommand(mcpUrl: string, apiKey: string): string {
  return `npx add-mcp brevet --url "${mcpUrl}" --header "Authorization: Bearer ${apiKey}"`;
}

/**
 * ChatGPT setup instructions (step-by-step text).
 */
export function getChatGPTInstructions(): string[] {
  return [
    "Open ChatGPT and go to Settings",
    'Navigate to "Connected Apps" or "MCP Servers"',
    'Click "Add Server" or "Connect New"',
    "Enter your MCP Server URL and API key when prompted",
    "Save and verify the connection by asking ChatGPT to list available tools",
  ];
}

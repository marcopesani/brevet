export interface DevLoginResponse {
  userId: string;
  walletAddress: string;
  hotWalletAddress: string | null;
  apiKey: string;
}

interface JsonRpcResponse<T> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

function parseSseJsonRpc<T>(raw: string): JsonRpcResponse<T> {
  const line = raw
    .split("\n")
    .find((candidate) => candidate.startsWith("data: "));

  if (!line) {
    throw new Error(`Could not parse MCP SSE response: ${raw.slice(0, 250)}`);
  }

  return JSON.parse(line.replace("data: ", "")) as JsonRpcResponse<T>;
}

export async function createOrRotateDevUser(
  baseUrl: string,
): Promise<DevLoginResponse> {
  const response = await fetch(`${baseUrl}/api/auth/dev-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      `dev-login failed with ${response.status}: ${await response.text()}`,
    );
  }

  return (await response.json()) as DevLoginResponse;
}

async function postMcpRequest<T>(
  baseUrl: string,
  apiKey: string,
  pathSegment: string,
  payload: Record<string, unknown>,
): Promise<JsonRpcResponse<T>> {
  const response = await fetch(`${baseUrl}/api/mcp/${pathSegment}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`MCP request failed with ${response.status}: ${await response.text()}`);
  }

  const text = await response.text();
  return parseSseJsonRpc<T>(text);
}

export async function initializeMcp(
  baseUrl: string,
  apiKey: string,
  pathSegment: string,
) {
  const data = await postMcpRequest<Record<string, unknown>>(
    baseUrl,
    apiKey,
    pathSegment,
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "synpress-playwright-e2e", version: "1.0.0" },
      },
    },
  );

  if (data.error) {
    throw new Error(`MCP initialize failed: ${data.error.message}`);
  }
}

interface ToolCallResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

export async function callMcpTool(
  baseUrl: string,
  apiKey: string,
  pathSegment: string,
  toolName: string,
  toolArgs: Record<string, unknown>,
): Promise<ToolCallResult> {
  const data = await postMcpRequest<ToolCallResult>(
    baseUrl,
    apiKey,
    pathSegment,
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: toolArgs,
      },
    },
  );

  if (data.error) {
    throw new Error(`MCP tool call failed: ${data.error.message}`);
  }

  if (!data.result) {
    throw new Error("MCP tool call returned no result");
  }

  return data.result;
}

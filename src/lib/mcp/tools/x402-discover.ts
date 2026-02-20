import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { textContent, jsonContent, toolError } from "../shared";

const DISCOVERY_API_URL =
  "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources";

export interface DiscoveryItem {
  resource: string;
  type: string;
  x402Version: number;
  lastUpdated: string;
  metadata: Record<string, unknown>;
  accepts: Array<{
    description: string;
    maxAmountRequired: string;
    network: string;
    scheme: string;
    resource: string;
    payTo: string;
    asset: string;
    [key: string]: unknown;
  }>;
}

export interface DiscoveryResponse {
  items: DiscoveryItem[];
  pagination: { limit: number; offset: number; total: number };
  x402Version: number;
}

export function registerX402Discover(
  server: McpServer,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _userId: string,
): void {
  server.registerTool(
    "x402_discover",
    {
      description:
        "Search the CDP Bazaar discovery API for available x402-protected endpoints. Returns a list of endpoints with their URL, description, price, network, and payment scheme. Endpoints may support multiple chains (Ethereum, Base, Arbitrum, Optimism, Polygon + testnets). Use the 'network' filter to find endpoints on a specific chain.",
      inputSchema: {
        query: z
          .string()
          .max(256)
          .optional()
          .describe(
            "Keyword to filter endpoints by description or URL",
          ),
        network: z
          .string()
          .max(64)
          .optional()
          .describe(
            'Network to filter by (e.g., "base", "base-sepolia", "eip155:8453")',
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Maximum number of results to return (default 20)"),
      },
    },
    async ({ query, network, limit }) => {
      try {
        const maxResults = limit ?? 20;

        const url = new URL(DISCOVERY_API_URL);
        url.searchParams.set("limit", String(maxResults));

        const response = await fetch(url.toString());

        if (!response.ok) {
          return textContent(
            `Error: Discovery API returned HTTP ${response.status}`,
            true,
          );
        }

        const data: DiscoveryResponse = await response.json();

        if (!data.items || !Array.isArray(data.items)) {
          return textContent(
            "Error: Unexpected response format from discovery API",
            true,
          );
        }

        let items = data.items;

        if (network) {
          const networkLower = network.toLowerCase();
          items = items.filter((item) =>
            item.accepts.some(
              (a) => a.network.toLowerCase() === networkLower,
            ),
          );
        }

        if (query) {
          const queryLower = query.toLowerCase();
          items = items.filter((item) => {
            const resourceMatch = item.resource
              .toLowerCase()
              .includes(queryLower);
            const descMatch = item.accepts.some((a) =>
              a.description.toLowerCase().includes(queryLower),
            );
            return resourceMatch || descMatch;
          });
        }

        if (items.length === 0) {
          return textContent("No endpoints found matching your query.");
        }

        const endpoints = items.map((item) => {
          const accept = item.accepts[0];
          return {
            url: item.resource,
            description: accept?.description ?? "No description",
            price: accept
              ? `${(Number(accept.maxAmountRequired) / 1e6).toFixed(6)} USDC`
              : "Unknown",
            network: accept?.network ?? "Unknown",
            scheme: accept?.scheme ?? "Unknown",
          };
        });

        return jsonContent({ count: endpoints.length, endpoints });
      } catch (error) {
        return toolError(error, "Failed to query discovery API");
      }
    },
  );
}

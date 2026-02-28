import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { searchMerchants, getCategories } from "@/lib/merchants";
import { textContent, jsonContent, toolError } from "../shared";

export function registerX402BrowseDirectory(
  server: McpServer,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _userId: string,
): void {
  server.registerTool(
    "x402_browse_directory",
    {
      description:
        "Browse the curated merchant directory of x402-compatible services. Returns a list of merchants that accept x402 payments, including their name, URL, description, category, supported chains, and pricing. Use the optional query and category parameters to filter results.",
      inputSchema: {
        query: z
          .string()
          .max(256)
          .optional()
          .describe(
            "Keyword to filter merchants by name, description, or URL",
          ),
        category: z
          .string()
          .max(64)
          .optional()
          .describe(
            "Category to filter by. Use without other params to see all merchants in a category.",
          ),
      },
    },
    async ({ query, category }) => {
      try {
        const merchants = searchMerchants(query, category);

        if (merchants.length === 0) {
          const categories = getCategories();
          return textContent(
            `No merchants found matching your query.${categories.length > 0 ? ` Available categories: ${categories.join(", ")}` : ""}`,
          );
        }

        const entries = merchants.map((m) => ({
          name: m.name,
          url: m.url,
          description: m.description,
          category: m.category,
          chains: m.chains,
          ...(m.pricing && { pricing: m.pricing }),
          source: m.source,
        }));

        return jsonContent({ count: entries.length, merchants: entries });
      } catch (error) {
        return toolError(error, "Failed to browse merchant directory");
      }
    },
  );
}

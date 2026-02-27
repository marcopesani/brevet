import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { getApiKeyPrefix } from "@/lib/data/users";
import { McpServerUrl } from "@/components/mcp-server-url";
import { ApiKeyCard } from "@/components/api-key-card";
import { MCP_TOOLS } from "@/lib/mcp/tool-registry";
import { getUserHumanHash } from "@/lib/data/wallet";

export default async function McpPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  const humanHash = await getUserHumanHash(user.userId);
  const apiKeyPrefix = await getApiKeyPrefix(user.userId);

  if (!humanHash) {
    // Backfill humanHash for existing users who don't have one yet
    const { upsertUser } = await import("@/lib/data/wallet");
    const user_record = await upsertUser(user.walletAddress);
    if (!user_record?.humanHash) {
      redirect("/login");
    }
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-xl font-semibold">MCP Configuration</h2>
          <p className="text-sm text-muted-foreground">
            Configure your MCP server endpoint and API key for AI agent integration.
          </p>
        </div>
        <McpServerUrl humanHash={user_record.humanHash!} tools={[...MCP_TOOLS]} />
        <ApiKeyCard apiKeyPrefix={apiKeyPrefix} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">MCP Configuration</h2>
        <p className="text-sm text-muted-foreground">
          Configure your MCP server endpoint and API key for AI agent integration.
        </p>
      </div>
      <McpServerUrl humanHash={humanHash} tools={[...MCP_TOOLS]} />
      <ApiKeyCard apiKeyPrefix={apiKeyPrefix} />
    </div>
  );
}

import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { getApiKeyPrefix } from "@/lib/data/users";
import { McpInstallGuide } from "@/components/mcp-install-guide";
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
            Connect your AI agent to Brevet in under a minute.
          </p>
        </div>
        <McpInstallGuide
          humanHash={user_record.humanHash!}
          apiKeyPrefix={apiKeyPrefix}
          tools={[...MCP_TOOLS]}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">MCP Configuration</h2>
        <p className="text-sm text-muted-foreground">
          Connect your AI agent to Brevet in under a minute.
        </p>
      </div>
      <McpInstallGuide
        humanHash={humanHash}
        apiKeyPrefix={apiKeyPrefix}
        tools={[...MCP_TOOLS]}
      />
    </div>
  );
}

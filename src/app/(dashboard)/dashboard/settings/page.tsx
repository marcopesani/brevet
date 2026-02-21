import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { McpServerUrl } from "@/components/mcp-server-url";
import { MCP_TOOLS } from "@/lib/mcp/tool-registry";
import { getUserHumanHash } from "@/lib/data/wallet";

export default async function SettingsPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  const humanHash = await getUserHumanHash(user.userId);

  if (!humanHash) {
    redirect("/login");
  }

  return (
    <div className="flex flex-col gap-6">
      <McpServerUrl humanHash={humanHash} tools={[...MCP_TOOLS]} />
    </div>
  );
}

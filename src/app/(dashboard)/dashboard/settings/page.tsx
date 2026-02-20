import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { McpServerUrl } from "@/components/mcp-server-url";
import { MCP_TOOLS } from "@/lib/mcp/tool-registry";

export default async function SettingsPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex flex-col gap-6">
      <McpServerUrl userId={user.userId} tools={[...MCP_TOOLS]} />
    </div>
  );
}

import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { getUserEnabledChains } from "@/lib/data/user";
import { ChainSettings } from "./chain-settings";

export default async function SettingsPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  const initialEnabledChains = await getUserEnabledChains(user.userId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">Settings</h2>
        <p className="text-sm text-muted-foreground">
          Manage your account settings and preferences.
        </p>
      </div>
      <ChainSettings initialEnabledChains={initialEnabledChains} />
    </div>
  );
}

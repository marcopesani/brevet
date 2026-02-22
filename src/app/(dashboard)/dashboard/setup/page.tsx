import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { getOnboardingState, getApiKeyPrefix } from "@/lib/data/users";
import { getSmartAccount } from "@/lib/data/smart-account";
import { getUserHumanHash } from "@/lib/data/wallet";
import { getDefaultChainConfig } from "@/lib/chain-config";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export default async function SetupPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }

  const chainId = getDefaultChainConfig().chain.id;

  const [onboardingState, apiKeyPrefix, humanHash, smartAccount] =
    await Promise.all([
      getOnboardingState(user.userId),
      getApiKeyPrefix(user.userId),
      getUserHumanHash(user.userId),
      getSmartAccount(user.userId, chainId),
    ]);

  // If onboarding is already complete, redirect to dashboard
  if (onboardingState.completedAt) {
    redirect("/dashboard");
  }

  const mcpUrl = humanHash ? `/api/mcp/${humanHash}` : `/api/mcp/${user.userId}`;

  return (
    <OnboardingWizard
      initialStep={onboardingState.currentStep}
      skippedSteps={onboardingState.skippedSteps}
      walletAddress={user.walletAddress}
      smartAccountAddress={smartAccount?.smartAccountAddress ?? null}
      mcpUrl={mcpUrl}
      apiKeyPrefix={apiKeyPrefix}
    />
  );
}

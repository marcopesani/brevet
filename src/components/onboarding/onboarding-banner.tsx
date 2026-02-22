import { CheckCircle2, Circle } from "lucide-react";
import { getOnboardingState } from "@/lib/data/users";
import { getSmartAccountBalance } from "@/lib/data/smart-account";
import { getDefaultChainConfig } from "@/lib/chain-config";
import { resumeOnboardingAction } from "@/app/actions/onboarding";

async function handleResumeOnboarding() {
  "use server";
  await resumeOnboardingAction();
}

interface OnboardingBannerProps {
  userId: string;
}

interface StepStatus {
  label: string;
  resolved: boolean;
}

export async function OnboardingBanner({ userId }: OnboardingBannerProps) {
  const state = await getOnboardingState(userId);

  // Don't show banner if onboarding is fully complete
  if (state.completedAt) return null;

  // Don't show if user hasn't even started (they'll be redirected to wizard)
  if (state.currentStep === 0 && !state.dismissedAt) return null;

  const chainId = getDefaultChainConfig().chain.id;
  const wallet = await getSmartAccountBalance(userId, chainId);
  const hasFunds = wallet !== null && parseFloat(wallet.balance) > 0;
  const mcpConnected = !!state.firstMcpCallAt;

  // Build 5-item checklist
  const steps: StepStatus[] = [
    { label: "Account Created", resolved: true },
    { label: "Wallet Connected", resolved: true },
    {
      label: "Create Smart Account",
      resolved: state.currentStep >= 1,
    },
    {
      label: "Fund Account",
      resolved:
        (state.currentStep >= 2 && !state.skippedSteps.includes(2)) ||
        hasFunds,
    },
    {
      label: "Install MCP",
      resolved:
        (state.currentStep >= 3 && !state.skippedSteps.includes(3)) ||
        mcpConnected,
    },
  ];

  const resolvedCount = steps.filter((s) => s.resolved).length;
  const allResolved = resolvedCount === steps.length;

  // Hide banner when all steps are resolved
  if (allResolved) return null;

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-3">
          <div>
            <p className="text-sm font-medium">Complete your setup</p>
            <p className="text-xs text-muted-foreground">
              {resolvedCount} of {steps.length} done
            </p>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {steps.map((step) => (
              <div key={step.label} className="flex items-center gap-1.5">
                {step.resolved ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />
                )}
                <span
                  className={`text-xs ${
                    step.resolved
                      ? "text-muted-foreground"
                      : "font-medium text-foreground"
                  }`}
                >
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <form action={handleResumeOnboarding}>
          <button
            type="submit"
            className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Continue Setup
          </button>
        </form>
      </div>
    </div>
  );
}

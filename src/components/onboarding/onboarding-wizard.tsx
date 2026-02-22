"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { StepIndicator } from "@/components/onboarding/step-indicator";
import { StepWrapper } from "@/components/onboarding/step-wrapper";
import CreateSmartAccountStep from "@/components/onboarding/steps/create-smart-account-step";
import FundAccountStep from "@/components/onboarding/steps/fund-account-step";
import InstallMcpStep from "@/components/onboarding/steps/install-mcp-step";
import {
  completeOnboardingStep,
  dismissOnboardingAction,
} from "@/app/actions/onboarding";

interface OnboardingWizardProps {
  initialStep: number;
  skippedSteps: number[];
  walletAddress: string;
  smartAccountAddress: string | null;
  mcpUrl: string;
  apiKeyPrefix: string | null;
}

export function OnboardingWizard(props: OnboardingWizardProps) {
  const { initialStep } = props;
  const router = useRouter();
  const [activeStep, setActiveStep] = useState(initialStep);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [isPending, startTransition] = useTransition();

  const isLastStep = activeStep === 2;

  function handleComplete() {
    startTransition(async () => {
      await completeOnboardingStep(activeStep + 1);

      if (isLastStep) {
        router.push("/dashboard");
        return;
      }

      setDirection("forward");
      setActiveStep((prev) => prev + 1);
    });
  }

  function handleSkip() {
    startTransition(async () => {
      await completeOnboardingStep(activeStep + 1, true);

      if (isLastStep) {
        router.push("/dashboard");
        return;
      }

      setDirection("forward");
      setActiveStep((prev) => prev + 1);
    });
  }

  function handleDismiss() {
    startTransition(async () => {
      await dismissOnboardingAction();
    });
  }

  function renderStep() {
    switch (activeStep) {
      case 0:
        return (
          <CreateSmartAccountStep
            onComplete={handleComplete}
            walletAddress={props.walletAddress}
            smartAccountAddress={props.smartAccountAddress}
          />
        );
      case 1:
        return (
          <FundAccountStep
            onComplete={handleComplete}
            onSkip={handleSkip}
            smartAccountAddress={props.smartAccountAddress!}
          />
        );
      case 2:
        return (
          <InstallMcpStep
            onComplete={handleComplete}
            onSkip={handleSkip}
            mcpUrl={props.mcpUrl}
            apiKey={props.apiKeyPrefix ?? ""}
          />
        );
      default:
        return null;
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl py-6 md:py-10">
      <Card>
        <CardHeader className="pb-2">
          <StepIndicator activeStep={activeStep} />
        </CardHeader>

        <CardContent className="min-h-[280px]">
          <StepWrapper activeStep={activeStep} direction={direction}>
            {renderStep()}
          </StepWrapper>
        </CardContent>

        <CardFooter className="flex-col gap-4">
          {/* Dismiss link — subtle, always visible */}
          <button
            onClick={handleDismiss}
            disabled={isPending}
            className="text-xs text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
          >
            I&apos;ll do this later
          </button>
        </CardFooter>
      </Card>
    </div>
  );
}

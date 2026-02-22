"use client";

import { cn } from "@/lib/utils";
import {
  ONBOARDING_STEPS,
  toDisplayIndex,
} from "@/components/onboarding/types";

interface StepWrapperProps {
  /** The current active step index (0-2). */
  activeStep: number;
  /** Animation direction: "forward" or "backward". */
  direction: "forward" | "backward";
  children: React.ReactNode;
}

export function StepWrapper({
  activeStep,
  direction,
  children,
}: StepWrapperProps) {
  const displayIndex = toDisplayIndex(activeStep);
  const step = ONBOARDING_STEPS[displayIndex];

  return (
    <div
      key={activeStep}
      className={cn(
        "animate-in fade-in-0 fill-mode-both duration-300",
        direction === "forward"
          ? "slide-in-from-right-4"
          : "slide-in-from-left-4"
      )}
    >
      <div className="mb-6">
        <h2 className="text-xl font-semibold">{step.label}</h2>
        <p className="text-sm text-muted-foreground">{step.description}</p>
      </div>
      {children}
    </div>
  );
}

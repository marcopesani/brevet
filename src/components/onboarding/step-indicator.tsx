"use client";

import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ONBOARDING_STEPS,
  TOTAL_STEPS,
  toDisplayIndex,
  getCompletedCount,
} from "@/components/onboarding/types";

interface StepIndicatorProps {
  /** The current active step index (0-2, corresponding to the 3 wizard steps). */
  activeStep: number;
}

export function StepIndicator({ activeStep }: StepIndicatorProps) {
  const displayIndex = toDisplayIndex(activeStep);
  const completedCount = getCompletedCount(activeStep);

  return (
    <div className="w-full">
      {/* Desktop: horizontal stepper */}
      <div className="hidden sm:block">
        <div className="flex items-center justify-between">
          {ONBOARDING_STEPS.map((step, index) => {
            const isCompleted = step.preCompleted || index < displayIndex;
            const isCurrent = index === displayIndex;
            const isLocked = index > displayIndex;

            return (
              <div key={step.label} className="flex flex-1 items-center">
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-medium transition-colors",
                      isCompleted &&
                        "border-primary bg-primary text-primary-foreground",
                      isCurrent &&
                        "border-primary bg-background text-primary ring-4 ring-primary/20",
                      isLocked &&
                        "border-muted-foreground/30 bg-muted text-muted-foreground"
                    )}
                  >
                    {isCompleted ? (
                      <Check className="size-4" />
                    ) : isLocked ? (
                      <Lock className="size-3.5" />
                    ) : (
                      index + 1
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-center text-xs font-medium",
                      isCompleted && "text-foreground",
                      isCurrent && "text-primary",
                      isLocked && "text-muted-foreground"
                    )}
                  >
                    {step.label}
                  </span>
                </div>
                {/* Connector line between steps */}
                {index < ONBOARDING_STEPS.length - 1 && (
                  <div
                    className={cn(
                      "mx-2 h-0.5 flex-1 transition-colors",
                      index < displayIndex
                        ? "bg-primary"
                        : "bg-muted-foreground/20"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile: compact "Step N of 5" */}
      <div className="flex items-center justify-between sm:hidden">
        <span className="text-sm font-medium text-muted-foreground">
          Step {displayIndex + 1} of {TOTAL_STEPS}
        </span>
        <span className="text-sm font-semibold text-primary">
          {completedCount} of {TOTAL_STEPS} done!
        </span>
      </div>

      {/* Progress text (desktop) */}
      <p className="mt-3 hidden text-center text-sm font-medium text-primary sm:block">
        {completedCount} of {TOTAL_STEPS} done!
      </p>
    </div>
  );
}

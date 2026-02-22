/**
 * Props interface for individual onboarding step components.
 * Step implementors should import this type.
 */
export interface StepProps {
  /** Called when the step is completed successfully. Advances to the next step. */
  onComplete: () => void;
  /** Called when the user chooses to skip this step (Steps 2 and 3 only). */
  onSkip?: () => void;
}

/** Configuration for each step in the wizard. */
export interface StepConfig {
  /** Display label for the stepper. */
  label: string;
  /** Short description shown below the label. */
  description: string;
  /** Whether this step is pre-completed (e.g., Account Created, Wallet Connected). */
  preCompleted?: boolean;
  /** Whether this step can be skipped. */
  skippable?: boolean;
}

/** All 5 steps in the onboarding wizard (2 pre-completed + 3 active). */
export const ONBOARDING_STEPS: StepConfig[] = [
  {
    label: "Account Created",
    description: "Your Brevet account is ready",
    preCompleted: true,
  },
  {
    label: "Wallet Connected",
    description: "Signed in with your wallet",
    preCompleted: true,
  },
  {
    label: "Create Smart Account",
    description: "Enable automated payments",
  },
  {
    label: "Fund Account",
    description: "Add USDC to your smart account",
    skippable: true,
  },
  {
    label: "Install MCP",
    description: "Connect your AI client",
    skippable: true,
  },
];

/** Number of pre-completed steps (Account Created + Wallet Connected). */
export const PRE_COMPLETED_COUNT = 2;

/** Total number of steps displayed in the stepper. */
export const TOTAL_STEPS = ONBOARDING_STEPS.length;

/**
 * Convert an active step index (0-2) to the display step index (2-4).
 * Active step 0 = display step 2 (third item in the 5-item stepper).
 */
export function toDisplayIndex(activeStep: number): number {
  return activeStep + PRE_COMPLETED_COUNT;
}

/**
 * Count completed steps for progress display.
 * Pre-completed steps always count. Active steps count if the current step is past them.
 */
export function getCompletedCount(activeStep: number): number {
  return PRE_COMPLETED_COUNT + activeStep;
}

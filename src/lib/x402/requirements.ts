import type { PaymentRequirements } from "@x402/core/types";
import {
  isPaymentRequirementsV1,
  isPaymentRequirementsV2,
} from "@x402/core/schemas";

/**
 * Get the token amount string from a validated PaymentRequirements (V1 or V2).
 * Uses @x402/core/schemas type guards so all V1/V2 branching lives in one place.
 *
 * - V1: returns requirement.maxAmountRequired
 * - V2: returns requirement.amount
 * - Otherwise: undefined
 */
export function getRequirementAmount(
  requirement: PaymentRequirements,
): string | undefined {
  if (isPaymentRequirementsV1(requirement)) {
    return requirement.maxAmountRequired;
  }
  if (isPaymentRequirementsV2(requirement)) {
    return requirement.amount;
  }
  return undefined;
}

/**
 * Get the token amount from an object that may have either V1 (maxAmountRequired)
 * or V2 (amount) shape. Used for discovery API items that are not validated
 * PaymentRequirements.
 */
export function getRequirementAmountFromLike(like: {
  amount?: string;
  maxAmountRequired?: string;
}): string | undefined {
  const v = like.amount ?? like.maxAmountRequired;
  return v != null && v !== "" ? v : undefined;
}

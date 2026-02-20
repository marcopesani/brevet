import { describe, it, expect } from "vitest";
import {
  getRequirementAmount,
  getRequirementAmountFromLike,
} from "../requirements";
import type { PaymentRequirementsV1, PaymentRequirementsV2 } from "@x402/core/schemas";

const V1_REQUIREMENT: PaymentRequirementsV1 = {
  scheme: "exact",
  network: "eip155:84532",
  maxAmountRequired: "1100",
  resource: "https://api.example.com/resource",
  description: "Test resource",
  payTo: "0x" + "b".repeat(40),
  maxTimeoutSeconds: 3600,
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

const V2_REQUIREMENT: PaymentRequirementsV2 = {
  scheme: "exact",
  network: "eip155:84532",
  amount: "50000",
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  payTo: "0x" + "b".repeat(40),
  maxTimeoutSeconds: 3600,
};

describe("getRequirementAmount", () => {
  it("returns maxAmountRequired for V1 requirement", () => {
    expect(getRequirementAmount(V1_REQUIREMENT)).toBe("1100");
  });

  it("returns amount for V2 requirement", () => {
    expect(getRequirementAmount(V2_REQUIREMENT)).toBe("50000");
  });
});

describe("getRequirementAmountFromLike", () => {
  it("returns maxAmountRequired when only V1 shape is present", () => {
    expect(
      getRequirementAmountFromLike({ maxAmountRequired: "1100" }),
    ).toBe("1100");
  });

  it("returns amount when only V2 shape is present", () => {
    expect(getRequirementAmountFromLike({ amount: "50000" })).toBe("50000");
  });

  it("prefers amount over maxAmountRequired when both present (V2 style)", () => {
    expect(
      getRequirementAmountFromLike({
        amount: "50000",
        maxAmountRequired: "1100",
      }),
    ).toBe("50000");
  });

  it("returns undefined when both are missing", () => {
    expect(getRequirementAmountFromLike({})).toBeUndefined();
  });

  it("returns undefined when value is empty string", () => {
    expect(getRequirementAmountFromLike({ amount: "" })).toBeUndefined();
    expect(getRequirementAmountFromLike({ maxAmountRequired: "" })).toBeUndefined();
  });
});

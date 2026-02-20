import { describe, it, expect } from "vitest";
import { createSigningRequest } from "../walletconnect-signer";
import type { PaymentRequirementsV1 } from "@x402/core/schemas";

const USER_ADDRESS = "0x" + "a".repeat(40) as `0x${string}`;

const V1_REQUIREMENT: PaymentRequirementsV1 = {
  scheme: "exact",
  network: "eip155:84532",
  maxAmountRequired: "1100",
  resource: "https://api.example.com/resource",
  description: "Test",
  payTo: "0x" + "b".repeat(40),
  maxTimeoutSeconds: 3600,
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

describe("createSigningRequest", () => {
  it("uses maxAmountRequired for V1 requirement and returns correct message value", () => {
    const request = createSigningRequest(V1_REQUIREMENT, USER_ADDRESS, 84532);
    expect(request.message.value).toBe(BigInt("1100"));
    expect(request.message.to).toBe(V1_REQUIREMENT.payTo);
    expect(request.message.from).toBe(USER_ADDRESS);
  });

  it("throws when requirement has no amount (neither amount nor maxAmountRequired)", () => {
    const noAmount = {
      ...V1_REQUIREMENT,
      maxAmountRequired: "",
    };
    expect(() =>
      createSigningRequest(noAmount as typeof V1_REQUIREMENT, USER_ADDRESS),
    ).toThrow("Payment requirement has no amount");
  });
});

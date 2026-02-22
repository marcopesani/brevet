import { describe, it, expect, vi, afterEach } from "vitest";
import { createSigningRequest } from "../walletconnect-signer";
import type { PaymentRequirements } from "@x402/core/types";
import * as requirements from "@/lib/x402/requirements";

const USER_ADDRESS = "0x" + "a".repeat(40) as `0x${string}`;

const V1_REQUIREMENT = {
  scheme: "exact",
  network: "eip155:84532",
  maxAmountRequired: "1100",
  resource: "https://api.example.com/resource",
  description: "Test",
  payTo: "0x" + "b".repeat(40),
  maxTimeoutSeconds: 3600,
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
} as unknown as PaymentRequirements;

describe("createSigningRequest", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses maxAmountRequired for V1 requirement and returns correct message value", () => {
    const request = createSigningRequest(V1_REQUIREMENT, USER_ADDRESS, 84532);
    expect(request.message.value).toBe(BigInt("1100"));
    expect(request.message.to).toBe((V1_REQUIREMENT as Record<string, unknown>).payTo);
    expect(request.message.from).toBe(USER_ADDRESS);
  });

  it("throws when requirement has no amount (neither amount nor maxAmountRequired)", () => {
    const noAmount = {
      ...V1_REQUIREMENT,
      maxAmountRequired: "",
    } as PaymentRequirements;
    expect(() =>
      createSigningRequest(noAmount, USER_ADDRESS),
    ).toThrow("Payment requirement has no amount");
  });

  it("sets validAfter to now - 600 seconds", () => {
    const fakeNow = 1700000000;
    vi.spyOn(Date, "now").mockReturnValue(fakeNow * 1000);

    const request = createSigningRequest(V1_REQUIREMENT, USER_ADDRESS, 84532);
    expect(request.message.validAfter).toBe(BigInt(fakeNow - 600));
  });

  it("sets validBefore to now + maxTimeoutSeconds", () => {
    const fakeNow = 1700000000;
    vi.spyOn(Date, "now").mockReturnValue(fakeNow * 1000);

    const request = createSigningRequest(V1_REQUIREMENT, USER_ADDRESS, 84532);
    // V1_REQUIREMENT has maxTimeoutSeconds: 3600
    expect(request.message.validBefore).toBe(BigInt(fakeNow + 3600));
  });

  it("uses maxTimeoutSeconds=60 for short-lived requirements", () => {
    const fakeNow = 1700000000;
    vi.spyOn(Date, "now").mockReturnValue(fakeNow * 1000);

    const shortTimeout = {
      ...V1_REQUIREMENT,
      maxTimeoutSeconds: 60,
    } as unknown as PaymentRequirements;

    const request = createSigningRequest(shortTimeout, USER_ADDRESS, 84532);
    expect(request.message.validBefore).toBe(BigInt(fakeNow + 60));
    expect(request.message.validAfter).toBe(BigInt(fakeNow - 600));
  });

  it("falls back to 600s when maxTimeoutSeconds is missing", () => {
    const fakeNow = 1700000000;
    vi.spyOn(Date, "now").mockReturnValue(fakeNow * 1000);

    // Mock getRequirementAmount so the amount extraction works even though
    // the object lacks maxTimeoutSeconds (which Zod requires for V1/V2).
    vi.spyOn(requirements, "getRequirementAmount").mockReturnValue("1100");

    const noTimeout = {
      scheme: "exact",
      network: "eip155:84532",
      payTo: "0x" + "b".repeat(40),
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      // maxTimeoutSeconds intentionally omitted
    } as unknown as PaymentRequirements;

    const request = createSigningRequest(noTimeout, USER_ADDRESS, 84532);
    expect(request.message.validBefore).toBe(BigInt(fakeNow + 600));
    expect(request.message.validAfter).toBe(BigInt(fakeNow - 600));
  });
});

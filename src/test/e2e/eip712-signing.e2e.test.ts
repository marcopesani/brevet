import { describe, it, expect } from "vitest";
import type { Hex } from "viem";
import { verifyTypedData } from "viem";
import {
  TEST_PRIVATE_KEY,
  TEST_WALLET_ADDRESS,
} from "@/test/helpers/crypto";
import { getDefaultChainConfig } from "@/lib/chain-config";
import { createEvmSigner, authorizationTypes } from "@/lib/x402/eip712";
import { buildPaymentHeaders } from "@/lib/x402/headers";
import crypto from "crypto";

describe("E2E: EIP-712 Signing", () => {
  const RECIPIENT = ("0x" + "b".repeat(40)) as Hex;

  /**
   * Helper: build a TransferWithAuthorization message.
   * Mirrors what the SDK's ExactEvmSchemeV1 does internally.
   */
  function buildTransferAuthorization(from: Hex, to: Hex, value: bigint) {
    const nonce = `0x${crypto.randomBytes(32).toString("hex")}` as Hex;
    const now = BigInt(Math.floor(Date.now() / 1000));
    return {
      from,
      to,
      value,
      validAfter: BigInt(0),
      validBefore: now + BigInt(300),
      nonce,
    };
  }

  describe("TransferWithAuthorization signing and verification", () => {
    it("should sign and verify a TransferWithAuthorization message", async () => {
      const signer = createEvmSigner(TEST_PRIVATE_KEY);
      const authorization = buildTransferAuthorization(
        TEST_WALLET_ADDRESS,
        RECIPIENT,
        BigInt(50000), // 0.05 USDC
      );

      const signature = await signer.signTypedData({
        domain: getDefaultChainConfig().usdcDomain,
        types: authorizationTypes,
        primaryType: "TransferWithAuthorization",
        message: {
          from: authorization.from,
          to: authorization.to,
          value: authorization.value,
          validAfter: authorization.validAfter,
          validBefore: authorization.validBefore,
          nonce: authorization.nonce,
        },
      });

      // Verify the signature recovers to the test wallet address
      const isValid = await verifyTypedData({
        address: TEST_WALLET_ADDRESS,
        domain: getDefaultChainConfig().usdcDomain,
        types: authorizationTypes,
        primaryType: "TransferWithAuthorization",
        message: {
          from: authorization.from,
          to: authorization.to,
          value: authorization.value,
          validAfter: authorization.validAfter,
          validBefore: authorization.validBefore,
          nonce: authorization.nonce,
        },
        signature,
      });

      expect(isValid).toBe(true);
    });

    it("should use the correct Sepolia USDC domain", () => {
      expect(getDefaultChainConfig().usdcDomain.name).toBe("USD Coin");
      expect(getDefaultChainConfig().usdcDomain.version).toBe("2");
      expect(getDefaultChainConfig().usdcDomain.chainId).toBe(84532);
      expect(getDefaultChainConfig().usdcDomain.verifyingContract).toBe(
        "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      );
    });

    it("should produce a valid signature for different amounts", async () => {
      const signer = createEvmSigner(TEST_PRIVATE_KEY);
      const amounts = [
        BigInt(1), // 0.000001 USDC
        BigInt(100000), // 0.1 USDC
        BigInt(1000000), // 1.0 USDC
        BigInt(5000000), // 5.0 USDC
      ];

      for (const amount of amounts) {
        const authorization = buildTransferAuthorization(
          TEST_WALLET_ADDRESS,
          RECIPIENT,
          amount,
        );

        const signature = await signer.signTypedData({
          domain: getDefaultChainConfig().usdcDomain,
          types: authorizationTypes,
          primaryType: "TransferWithAuthorization",
          message: {
            from: authorization.from,
            to: authorization.to,
            value: authorization.value,
            validAfter: authorization.validAfter,
            validBefore: authorization.validBefore,
            nonce: authorization.nonce,
          },
        });

        const isValid = await verifyTypedData({
          address: TEST_WALLET_ADDRESS,
          domain: getDefaultChainConfig().usdcDomain,
          types: authorizationTypes,
          primaryType: "TransferWithAuthorization",
          message: {
            from: authorization.from,
            to: authorization.to,
            value: authorization.value,
            validAfter: authorization.validAfter,
            validBefore: authorization.validBefore,
            nonce: authorization.nonce,
          },
          signature,
        });

        expect(isValid).toBe(true);
      }
    });

    it("should produce a valid signature for different recipients", async () => {
      const signer = createEvmSigner(TEST_PRIVATE_KEY);
      const recipients: Hex[] = [
        ("0x" + "a".repeat(40)) as Hex,
        ("0x" + "c".repeat(40)) as Hex,
        "0x1234567890abcdef1234567890abcdef12345678" as Hex,
      ];

      for (const to of recipients) {
        const authorization = buildTransferAuthorization(
          TEST_WALLET_ADDRESS,
          to,
          BigInt(50000),
        );

        const signature = await signer.signTypedData({
          domain: getDefaultChainConfig().usdcDomain,
          types: authorizationTypes,
          primaryType: "TransferWithAuthorization",
          message: {
            from: authorization.from,
            to: authorization.to,
            value: authorization.value,
            validAfter: authorization.validAfter,
            validBefore: authorization.validBefore,
            nonce: authorization.nonce,
          },
        });

        const isValid = await verifyTypedData({
          address: TEST_WALLET_ADDRESS,
          domain: getDefaultChainConfig().usdcDomain,
          types: authorizationTypes,
          primaryType: "TransferWithAuthorization",
          message: {
            from: authorization.from,
            to: authorization.to,
            value: authorization.value,
            validAfter: authorization.validAfter,
            validBefore: authorization.validBefore,
            nonce: authorization.nonce,
          },
          signature,
        });

        expect(isValid).toBe(true);
      }
    });

    it("should fail verification with a different signer address", async () => {
      const signer = createEvmSigner(TEST_PRIVATE_KEY);
      const authorization = buildTransferAuthorization(
        TEST_WALLET_ADDRESS,
        RECIPIENT,
        BigInt(50000),
      );

      const signature = await signer.signTypedData({
        domain: getDefaultChainConfig().usdcDomain,
        types: authorizationTypes,
        primaryType: "TransferWithAuthorization",
        message: {
          from: authorization.from,
          to: authorization.to,
          value: authorization.value,
          validAfter: authorization.validAfter,
          validBefore: authorization.validBefore,
          nonce: authorization.nonce,
        },
      });

      // Verify with a WRONG address should fail
      const wrongAddress = ("0x" + "d".repeat(40)) as Hex;
      const isValid = await verifyTypedData({
        address: wrongAddress,
        domain: getDefaultChainConfig().usdcDomain,
        types: authorizationTypes,
        primaryType: "TransferWithAuthorization",
        message: {
          from: authorization.from,
          to: authorization.to,
          value: authorization.value,
          validAfter: authorization.validAfter,
          validBefore: authorization.validBefore,
          nonce: authorization.nonce,
        },
        signature,
      });

      expect(isValid).toBe(false);
    });
  });

  describe("Authorization field validation", () => {
    it("should set from address to the hot wallet address", () => {
      const authorization = buildTransferAuthorization(
        TEST_WALLET_ADDRESS,
        RECIPIENT,
        BigInt(50000),
      );

      expect(authorization.from).toBe(TEST_WALLET_ADDRESS);
    });

    it("should set validAfter to 0 (immediately valid)", () => {
      const authorization = buildTransferAuthorization(
        TEST_WALLET_ADDRESS,
        RECIPIENT,
        BigInt(50000),
      );

      expect(authorization.validAfter).toBe(BigInt(0));
    });

    it("should set validBefore to ~5 minutes in the future", () => {
      const beforeBuild = BigInt(Math.floor(Date.now() / 1000));
      const authorization = buildTransferAuthorization(
        TEST_WALLET_ADDRESS,
        RECIPIENT,
        BigInt(50000),
      );
      const afterBuild = BigInt(Math.floor(Date.now() / 1000));

      // validBefore should be between now+299 and now+301
      expect(authorization.validBefore).toBeGreaterThanOrEqual(
        beforeBuild + BigInt(299),
      );
      expect(authorization.validBefore).toBeLessThanOrEqual(
        afterBuild + BigInt(301),
      );
    });

    it("should generate unique nonces for each authorization", () => {
      const auth1 = buildTransferAuthorization(
        TEST_WALLET_ADDRESS,
        RECIPIENT,
        BigInt(50000),
      );
      const auth2 = buildTransferAuthorization(
        TEST_WALLET_ADDRESS,
        RECIPIENT,
        BigInt(50000),
      );

      expect(auth1.nonce).not.toBe(auth2.nonce);
      // Nonces should be valid 32-byte hex values
      expect(auth1.nonce.startsWith("0x")).toBe(true);
      expect(auth1.nonce.length).toBe(66); // 0x + 64 hex chars
    });
  });

  describe("Payment signature header encoding", () => {
    it("should produce valid payment headers from a V1 payload", () => {
      const paymentPayload = {
        x402Version: 1 as const,
        scheme: "exact",
        network: "base-sepolia",
        payload: {
          signature: "0xdeadbeef" as Hex,
          authorization: {
            from: TEST_WALLET_ADDRESS,
            to: RECIPIENT,
            value: "50000",
            validAfter: "0",
            validBefore: "1748736300",
            nonce: ("0x" + "0".repeat(63) + "1") as Hex,
          },
        },
      };

      // Cast needed: SDK types PaymentPayloadV1.network as `${string}:${string}`,
      // but V1 networks are plain names like "base-sepolia"
      const headers = buildPaymentHeaders(paymentPayload as any);

      // V1 uses X-PAYMENT header
      expect(headers).toHaveProperty("X-PAYMENT");
      expect(typeof headers["X-PAYMENT"]).toBe("string");

      // Should be valid base64
      const decoded = JSON.parse(atob(headers["X-PAYMENT"]));
      expect(decoded.x402Version).toBe(1);
      expect(decoded.scheme).toBe("exact");
      expect(decoded.network).toBe("base-sepolia");
      expect(decoded.payload.signature).toBe("0xdeadbeef");
      expect(decoded.payload.authorization.from).toBe(TEST_WALLET_ADDRESS);
      expect(decoded.payload.authorization.to).toBe(RECIPIENT);
      expect(decoded.payload.authorization.value).toBe("50000");
    });
  });
});

import { describe, it, expect } from "vitest";
import {
  parsePaymentRequired,
  buildPaymentHeaders,
  extractTxHashFromResponse,
  extractSettleResponse,
} from "../headers";

// Helper to create a Response with given headers and body
function makeResponse(
  status: number,
  headers: Record<string, string>,
  body?: string,
): Response {
  return new Response(body ?? "", {
    status,
    headers: new Headers(headers),
  });
}

describe("parsePaymentRequired", () => {
  it("parses V1 body-based payment requirements", () => {
    const v1Body = {
      x402Version: 1,
      error: "Payment Required",
      accepts: [
        {
          scheme: "exact",
          network: "base-sepolia",
          maxAmountRequired: "50000",
          resource: "https://api.example.com/resource",
          description: "Test resource",
          mimeType: "application/json",
          payTo: "0x" + "b".repeat(40),
          maxTimeoutSeconds: 3600,
          asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          extra: { name: "USD Coin", version: "2" },
        },
      ],
    };

    const response = makeResponse(
      402,
      { "Content-Type": "application/json" },
      JSON.stringify(v1Body),
    );

    const result = parsePaymentRequired(response, v1Body);
    expect(result).not.toBeNull();
    expect(result!.accepts).toHaveLength(1);
    expect(result!.accepts[0].scheme).toBe("exact");
  });

  it("parses V2 header-based payment requirements", () => {
    const v2PaymentRequired = {
      x402Version: 2,
      resource: {
        url: "https://api.example.com/resource",
        description: "Test resource",
        mimeType: "application/json",
      },
      accepts: [
        {
          scheme: "exact",
          network: "eip155:84532",
          asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          amount: "50000",
          payTo: "0x" + "b".repeat(40),
          maxTimeoutSeconds: 300,
          extra: { name: "USD Coin", version: "2" },
        },
      ],
    };

    const encoded = Buffer.from(JSON.stringify(v2PaymentRequired)).toString("base64");
    const response = makeResponse(
      402,
      { "Payment-Required": encoded },
      "{}",
    );

    const result = parsePaymentRequired(response, {});
    expect(result).not.toBeNull();
    expect(result!.x402Version).toBe(2);
    expect(result!.accepts).toHaveLength(1);
    expect(result!.accepts[0].amount).toBe("50000");
    expect(result!.accepts[0].network).toBe("eip155:84532");
  });

  it("returns null when no payment headers or body present", () => {
    const response = makeResponse(402, {});
    const result = parsePaymentRequired(response);
    expect(result).toBeNull();
  });

  it("returns null for malformed data", () => {
    const response = makeResponse(
      402,
      { "Payment-Required": "not valid base64 json{" },
    );
    const result = parsePaymentRequired(response);
    expect(result).toBeNull();
  });
});

describe("buildPaymentHeaders", () => {
  it("produces payment headers from a PaymentPayload", () => {
    const paymentPayload = {
      x402Version: 2,
      resource: {
        url: "https://api.example.com/resource",
        description: "Test",
        mimeType: "application/json",
      },
      accepted: {
        scheme: "exact",
        network: "eip155:84532" as `${string}:${string}`,
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        amount: "50000",
        payTo: "0x" + "b".repeat(40),
        maxTimeoutSeconds: 300,
        extra: {},
      },
      payload: {
        signature: "0xdeadbeef",
        authorization: {
          from: "0x" + "a".repeat(40),
          to: "0x" + "b".repeat(40),
          value: "50000",
          validAfter: "0",
          validBefore: "1748736300",
          nonce: "0x" + "0".repeat(63) + "1",
        },
      },
    };

    const headers = buildPaymentHeaders(paymentPayload);

    // Should return a record with at least one header
    expect(typeof headers).toBe("object");
    const headerKeys = Object.keys(headers);
    expect(headerKeys.length).toBeGreaterThan(0);

    // V2 should use Payment-Signature header
    const hasPaymentHeader = headerKeys.some(
      (k) => k.toLowerCase() === "payment-signature" || k.toLowerCase() === "x-payment",
    );
    expect(hasPaymentHeader).toBe(true);
  });
});

describe("extractTxHashFromResponse", () => {
  it("extracts tx hash from X-PAYMENT-TX-HASH header", async () => {
    const response = makeResponse(
      200,
      { "X-PAYMENT-TX-HASH": "0x" + "a".repeat(64) },
      "{}",
    );

    const hash = await extractTxHashFromResponse(response);
    expect(hash).toBe("0x" + "a".repeat(64));
  });

  it("extracts tx hash from JSON body when header is absent", async () => {
    const txHash = "0x" + "b".repeat(64);
    const response = makeResponse(
      200,
      { "Content-Type": "application/json" },
      JSON.stringify({ success: true, txHash }),
    );

    const hash = await extractTxHashFromResponse(response);
    expect(hash).toBe(txHash);
  });

  it("prefers header over JSON body", async () => {
    const headerHash = "0x" + "a".repeat(64);
    const bodyHash = "0x" + "b".repeat(64);
    const response = makeResponse(
      200,
      {
        "X-PAYMENT-TX-HASH": headerHash,
        "Content-Type": "application/json",
      },
      JSON.stringify({ txHash: bodyHash }),
    );

    const hash = await extractTxHashFromResponse(response);
    expect(hash).toBe(headerHash);
  });

  it("returns null when no tx hash is present", async () => {
    const response = makeResponse(200, {}, "OK");
    const hash = await extractTxHashFromResponse(response);
    expect(hash).toBeNull();
  });

  it("returns null for non-JSON body without header", async () => {
    const response = makeResponse(
      200,
      { "Content-Type": "text/plain" },
      "Some text response",
    );

    const hash = await extractTxHashFromResponse(response);
    expect(hash).toBeNull();
  });

  it("returns null when JSON body has no txHash field", async () => {
    const response = makeResponse(
      200,
      { "Content-Type": "application/json" },
      JSON.stringify({ success: true }),
    );

    const hash = await extractTxHashFromResponse(response);
    expect(hash).toBeNull();
  });

  it("returns null for invalid JSON body", async () => {
    const response = makeResponse(
      200,
      { "Content-Type": "application/json" },
      "not valid json{",
    );

    const hash = await extractTxHashFromResponse(response);
    expect(hash).toBeNull();
  });

  it("ignores header value that doesn't start with 0x", async () => {
    const response = makeResponse(
      200,
      { "X-PAYMENT-TX-HASH": "not-a-hash" },
      "{}",
    );

    const hash = await extractTxHashFromResponse(response);
    expect(hash).toBeNull();
  });
});

describe("extractSettleResponse", () => {
  const sampleSettle = {
    success: true,
    transaction: "0x" + "a".repeat(64),
    network: "eip155:8453",
    payer: "0x" + "c".repeat(40),
  };

  it("parses V2 Payment-Response header (base64-encoded JSON)", () => {
    const encoded = Buffer.from(JSON.stringify(sampleSettle)).toString("base64");
    const response = makeResponse(200, { "PAYMENT-RESPONSE": encoded }, "{}");

    const result = extractSettleResponse(response);
    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
    expect(result!.transaction).toBe(sampleSettle.transaction);
    expect(result!.network).toBe("eip155:8453");
    expect(result!.payer).toBe(sampleSettle.payer);
  });

  it("parses V1 X-Payment-Response header (base64-encoded JSON)", () => {
    const encoded = Buffer.from(JSON.stringify(sampleSettle)).toString("base64");
    const response = makeResponse(200, { "X-PAYMENT-RESPONSE": encoded }, "{}");

    const result = extractSettleResponse(response);
    expect(result).not.toBeNull();
    expect(result!.transaction).toBe(sampleSettle.transaction);
    expect(result!.network).toBe("eip155:8453");
  });

  it("prefers V2 Payment-Response over V1 X-Payment-Response", () => {
    const v2Settle = { ...sampleSettle, transaction: "0x" + "a".repeat(64) };
    const v1Settle = { ...sampleSettle, transaction: "0x" + "b".repeat(64) };
    const v2Encoded = Buffer.from(JSON.stringify(v2Settle)).toString("base64");
    const v1Encoded = Buffer.from(JSON.stringify(v1Settle)).toString("base64");
    const response = makeResponse(
      200,
      { "PAYMENT-RESPONSE": v2Encoded, "X-PAYMENT-RESPONSE": v1Encoded },
      "{}",
    );

    const result = extractSettleResponse(response);
    expect(result).not.toBeNull();
    expect(result!.transaction).toBe(v2Settle.transaction);
  });

  it("returns null when no settlement headers are present", () => {
    const response = makeResponse(200, {}, "{}");
    const result = extractSettleResponse(response);
    expect(result).toBeNull();
  });

  it("returns null for invalid base64 header value", () => {
    const response = makeResponse(
      200,
      { "PAYMENT-RESPONSE": "not valid base64{" },
      "{}",
    );
    const result = extractSettleResponse(response);
    expect(result).toBeNull();
  });

  it("includes optional fields when present", () => {
    const settleWithExtras = {
      ...sampleSettle,
      errorReason: undefined,
      extensions: { custom: "data" },
    };
    const encoded = Buffer.from(JSON.stringify(settleWithExtras)).toString("base64");
    const response = makeResponse(200, { "PAYMENT-RESPONSE": encoded }, "{}");

    const result = extractSettleResponse(response);
    expect(result).not.toBeNull();
    expect(result!.extensions).toEqual({ custom: "data" });
  });
});

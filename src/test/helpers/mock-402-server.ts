import http from "http";

export interface MockPaymentRequirement {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  payTo: string;
  requiredDeadlineSeconds?: number;
  description?: string;
}

export interface Mock402Config {
  /** Payment requirements to include in 402 responses. */
  paymentRequirements?: MockPaymentRequirement[];
  /** If true, accept any payment signature and return 200. */
  acceptPayment?: boolean;
  /** Optional tx hash to return after payment is accepted. */
  txHash?: string;
  /** If true, return a 402 with invalid/missing payment requirements. */
  invalidRequirements?: boolean;
}

const DEFAULT_PAYMENT_REQUIREMENTS: MockPaymentRequirement[] = [
  {
    scheme: "exact",
    network: "eip155:84532",
    maxAmountRequired: "50000",
    resource: "http://localhost/test-resource",
    payTo: "0x" + "b".repeat(40),
    requiredDeadlineSeconds: 3600,
  },
];

let server: http.Server | null = null;

/**
 * Start a mock HTTP server that returns 402 Payment Required responses.
 * Configure behavior via the config parameter.
 */
export function startMock402Server(
  config: Mock402Config = {},
  port = 0,
): Promise<{ server: http.Server; port: number; url: string }> {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      // Check if this request includes a payment signature
      const paymentHeader = req.headers["x-payment-signature"];

      if (paymentHeader && config.acceptPayment !== false) {
        // Payment received — return 200
        res.writeHead(200, {
          "Content-Type": "application/json",
          ...(config.txHash
            ? { "X-PAYMENT-TX-HASH": config.txHash }
            : {}),
        });
        res.end(
          JSON.stringify({
            success: true,
            ...(config.txHash ? { txHash: config.txHash } : {}),
          }),
        );
        return;
      }

      if (config.invalidRequirements) {
        // Return 402 with no valid payment requirements
        res.writeHead(402, { "Content-Type": "text/plain" });
        res.end("Payment Required");
        return;
      }

      // Return 402 with payment requirements
      const requirements =
        config.paymentRequirements ?? DEFAULT_PAYMENT_REQUIREMENTS;

      // Update resource URL to point to this server
      const address = srv.address();
      const actualPort =
        typeof address === "object" && address ? address.port : port;
      const updatedRequirements = requirements.map((r) => ({
        ...r,
        resource: r.resource.replace(
          "localhost/",
          `localhost:${actualPort}/`,
        ),
      }));

      res.writeHead(402, {
        "Content-Type": "application/json",
        "X-PAYMENT": JSON.stringify(updatedRequirements),
      });
      res.end(JSON.stringify({ error: "Payment Required" }));
    });

    srv.on("error", reject);

    srv.listen(port, "127.0.0.1", () => {
      const address = srv.address();
      const actualPort =
        typeof address === "object" && address ? address.port : 0;
      server = srv;
      resolve({
        server: srv,
        port: actualPort,
        url: `http://127.0.0.1:${actualPort}`,
      });
    });
  });
}

/**
 * Stop the mock 402 server.
 */
export function stopMock402Server(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server) {
      resolve();
      return;
    }
    server.close((err) => {
      server = null;
      if (err) reject(err);
      else resolve();
    });
  });
}

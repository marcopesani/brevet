import http, { type IncomingMessage, type ServerResponse } from "node:http";

interface Mock402ServerOptions {
  network: string;
  maxAmountRequired: string;
  payTo: `0x${string}`;
  asset: `0x${string}`;
}

function hasPaymentHeaders(req: IncomingMessage): boolean {
  const headers = req.headers;
  return Boolean(
    headers["x-payment"] ??
      headers["payment"] ??
      headers["payment-signature"] ??
      headers["x-payment-signature"],
  );
}

export async function startMock402Server({
  network,
  maxAmountRequired,
  payTo,
  asset,
}: Mock402ServerOptions): Promise<{
  baseUrl: string;
  stop: () => Promise<void>;
}> {
  const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
    const requestUrl = req.url ?? "/paid-resource";

    if (hasPaymentHeaders(req)) {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "X-PAYMENT-TX-HASH": `0x${"f".repeat(64)}`,
      });
      res.end(JSON.stringify({ success: true, route: requestUrl }));
      return;
    }

    const port = (server.address() as { port: number }).port;
    const resource = `http://127.0.0.1:${port}${requestUrl}`;

    res.writeHead(402, {
      "Content-Type": "application/json",
    });
    res.end(
      JSON.stringify({
        x402Version: 1,
        error: "Payment Required",
        accepts: [
          {
            scheme: "exact",
            network,
            maxAmountRequired,
            resource,
            description: "E2E payment requirement",
            payTo,
            maxTimeoutSeconds: 600,
            asset,
            extra: { name: "USDC", version: "2" },
          },
        ],
      }),
    );
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

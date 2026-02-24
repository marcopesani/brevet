import { callMcpTool, createOrRotateDevUser, initializeMcp } from "./mcp";
import { startMock402Server } from "./mock-402-server";

const POLYGON_AMOY_CHAIN = "eip155:80002";
const POLYGON_AMOY_USDC = "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582";

export async function createPendingPaymentForDevUser(baseUrl: string) {
  const devUser = await createOrRotateDevUser(baseUrl);
  const mockServer = await startMock402Server({
    network: POLYGON_AMOY_CHAIN,
    maxAmountRequired: "100000", // 0.1 USDC
    payTo: "0x1111111111111111111111111111111111111111",
    asset: POLYGON_AMOY_USDC,
  });

  await initializeMcp(baseUrl, devUser.apiKey, devUser.userId);

  const toolResult = await callMcpTool(
    baseUrl,
    devUser.apiKey,
    devUser.userId,
    "x402_pay",
    { url: `${mockServer.baseUrl}/paid-resource` },
  );

  const message = toolResult.content[0]?.text ?? "";
  const paymentIdMatch = message.match(/Payment ID:\s*([a-f0-9]{24})/i);

  if (!paymentIdMatch?.[1]) {
    await mockServer.stop();
    throw new Error(`Could not extract paymentId from MCP response: ${message}`);
  }

  return {
    paymentId: paymentIdMatch[1],
    stopServer: mockServer.stop,
  };
}

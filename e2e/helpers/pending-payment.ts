import { callMcpTool, createOrRotateDevUser, initializeMcp } from "./mcp";
import { startMock402Server } from "./mock-402-server";

const ETH_SEPOLIA_CHAIN = "eip155:11155111";
const ETH_SEPOLIA_USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

export async function createPendingPaymentForDevUser(baseUrl: string) {
  const devUser = await createOrRotateDevUser(baseUrl);
  const mockServer = await startMock402Server({
    network: ETH_SEPOLIA_CHAIN,
    maxAmountRequired: "100000", // 0.1 USDC
    payTo: "0x1111111111111111111111111111111111111111",
    asset: ETH_SEPOLIA_USDC,
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

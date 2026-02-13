import type { App as McpApp, McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { useApp } from "@modelcontextprotocol/ext-apps/react";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

interface EIP1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMetaMask?: boolean;
}

function getEthereumProvider(): EIP1193Provider | undefined {
  const eth = (window as unknown as Record<string, unknown>).ethereum;
  if (eth && typeof eth === "object" && "request" in eth) {
    return eth as EIP1193Provider;
  }
  return undefined;
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function WalletConnectDemo() {
  const [toolResult, setToolResult] = useState<CallToolResult | null>(null);
  const [hostContext, setHostContext] = useState<McpUiHostContext | undefined>();

  const { app, error } = useApp({
    appInfo: { name: "WalletConnect Demo", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (app) => {
      app.ontoolresult = async (result) => {
        console.info("Received tool result:", result);
        setToolResult(result);
      };
      app.onerror = console.error;
      app.onhostcontextchanged = (params) => {
        setHostContext((prev) => ({ ...prev, ...params }));
      };
    },
  });

  useEffect(() => {
    if (app) {
      setHostContext(app.getHostContext());
    }
  }, [app]);

  if (error) return <div style={{ padding: "16px", color: "red" }}>Error: {error.message}</div>;
  if (!app) return <div style={{ padding: "16px" }}>Connecting...</div>;

  return <WalletConnectInner app={app} hostContext={hostContext} />;
}

interface WalletConnectInnerProps {
  app: McpApp;
  hostContext?: McpUiHostContext;
}

function WalletConnectInner({ app, hostContext }: WalletConnectInnerProps) {
  const [address, setAddress] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const handleConnect = useCallback(async () => {
    setErrorMsg(null);
    setConnecting(true);

    try {
      const provider = getEthereumProvider();
      if (!provider) {
        setErrorMsg("No wallet found. Please install MetaMask or another wallet.");
        setConnecting(false);
        return;
      }

      const accounts = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[];

      if (accounts && accounts.length > 0) {
        const connectedAddress = accounts[0];
        setAddress(connectedAddress);

        // Report back to the host
        try {
          await app.callServerTool({
            name: "demo_walletconnect_result",
            arguments: { address: connectedAddress },
          });
        } catch (e) {
          // Tool might not exist on server yet, that's OK
          console.warn("Could not report address to server:", e);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Wallet connection failed";
      setErrorMsg(message);
    } finally {
      setConnecting(false);
    }
  }, [app]);

  return (
    <main
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "16px",
        paddingTop: hostContext?.safeAreaInsets?.top,
        paddingRight: hostContext?.safeAreaInsets?.right,
        paddingBottom: hostContext?.safeAreaInsets?.bottom,
        paddingLeft: hostContext?.safeAreaInsets?.left,
      }}
    >
      {address ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "12px 20px",
            borderRadius: "12px",
            backgroundColor: "rgba(34, 197, 94, 0.1)",
            border: "1px solid rgba(34, 197, 94, 0.3)",
          }}
        >
          <span style={{ color: "#22c55e", fontSize: "18px" }}>●</span>
          <span style={{ fontWeight: 600 }}>Connected:</span>
          <code
            style={{
              backgroundColor: "rgba(0,0,0,0.05)",
              padding: "4px 8px",
              borderRadius: "6px",
              fontSize: "14px",
            }}
          >
            {truncateAddress(address)}
          </code>
        </div>
      ) : (
        <button
          onClick={handleConnect}
          disabled={connecting}
          style={{
            padding: "12px 24px",
            fontSize: "16px",
            fontWeight: 600,
            borderRadius: "12px",
            border: "none",
            backgroundColor: "#3b82f6",
            color: "white",
            cursor: connecting ? "wait" : "pointer",
            opacity: connecting ? 0.7 : 1,
            transition: "opacity 0.2s",
          }}
        >
          {connecting ? "Connecting..." : "Connect Wallet"}
        </button>
      )}

      {errorMsg && (
        <div
          style={{
            color: "#ef4444",
            fontSize: "14px",
            padding: "8px 16px",
            borderRadius: "8px",
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            maxWidth: "400px",
            textAlign: "center",
          }}
        >
          {errorMsg}
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WalletConnectDemo />
  </StrictMode>
);

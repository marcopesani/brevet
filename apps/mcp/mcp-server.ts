import cors from "cors";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { z } from "zod";

const port = Number(process.env.MCP_SERVER_PORT ?? 3333);

const formatHello = (name: string) =>
  `Hello ${name}, from the MCP tool at ${new Date().toISOString()}`;

const createServer = () => {
  const server = new McpServer({
    name: "brevet-mcp-server",
    version: "0.1.0",
  });

  server.registerTool(
    "hello",
    {
      description: "Returns a hello-world message for a given name.",
      inputSchema: {
        name: z.string().default("world"),
      },
    },
    async ({ name }) => {
      return {
        content: [{ type: "text", text: formatHello(name) }],
      };
    }
  );

  return server;
};

const app = createMcpExpressApp();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

// Thin helper endpoint for the Vite UI to quickly demo the same tool behavior.
app.get("/api/hello", (req, res) => {
  const name = typeof req.query.name === "string" ? req.query.name : "world";
  res.status(200).json({
    tool: "hello",
    result: formatHello(name),
  });
});

app.post("/mcp", async (req, res) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Failed to handle MCP request", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  } finally {
    transport.close();
    server.close();
  }
});

app.listen(port, "127.0.0.1", () => {
  console.log(`MCP server listening on http://127.0.0.1:${port}`);
});

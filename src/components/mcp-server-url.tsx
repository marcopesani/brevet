"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { McpToolDescriptor } from "@/lib/mcp/tool-registry";

interface McpServerUrlProps {
  humanHash: string;
  tools: McpToolDescriptor[];
}

export function McpServerUrl({ humanHash, tools }: McpServerUrlProps) {
  const [copied, setCopied] = useState(false);

  const mcpUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/mcp/${humanHash}`
      : `/api/mcp/${humanHash}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(mcpUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = mcpUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>MCP Server URL</CardTitle>
        <CardDescription>
          Use this URL to connect AI agents to your payment gateway.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="bg-muted min-w-0 flex-1 rounded-md border px-3 py-2">
            <p className="truncate font-mono text-sm">{mcpUrl}</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleCopy}>
            {copied ? (
              <>
                <Check className="size-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="size-4" />
                Copy
              </>
            )}
          </Button>
        </div>
        <Separator />
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Configure your AI agent</h4>
          <p className="text-muted-foreground text-sm">
            Point your MCP-compatible AI agent to this endpoint. The agent can
            use the following tools:
          </p>
          <div className="flex flex-wrap gap-2">
            {tools.map((tool) => (
              <Badge key={tool.name} variant="secondary" title={tool.summary}>
                {tool.name}
              </Badge>
            ))}
          </div>
        </div>
        <Separator />
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Authentication</h4>
          <p className="text-muted-foreground text-sm">
            Include your API key in requests using the Authorization header:
          </p>
          <div className="bg-muted rounded-md border px-3 py-2">
            <p className="font-mono text-sm">
              Authorization: Bearer {"<your-api-key>"}
            </p>
          </div>
          <p className="text-muted-foreground text-sm">
            Or pass it as a query parameter: <code className="text-xs">?api_key=brv_...</code>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

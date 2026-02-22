"use client";

import { useState } from "react";
import { Copy, Check, ExternalLink, Eye, EyeOff, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  getCursorDeeplink,
  getVSCodeDeeplink,
  getClaudeCodeCommand,
  getClaudeDesktopConfig,
  getClaudeDesktopConfigPath,
  getWindsurfConfig,
  getWindsurfConfigPath,
  getUniversalCommand,
  getChatGPTInstructions,
  type McpClientId,
} from "@/lib/mcp-install";

interface InstallMcpStepProps {
  onComplete: () => void;
  onSkip: () => void;
  mcpUrl: string;
  apiKey: string;
}

export default function InstallMcpStep({
  onComplete,
  onSkip,
  mcpUrl,
  apiKey,
}: InstallMcpStepProps) {
  const [activeTab, setActiveTab] = useState<McpClientId>("cursor");
  const [apiKeyRevealed, setApiKeyRevealed] = useState(false);

  const maskedKey = apiKey.length > 8
    ? `${apiKey.slice(0, 8)}${"•".repeat(Math.min(24, apiKey.length - 8))}`
    : apiKey;

  return (
    <div className="space-y-6">
      {/* API Key display */}
      <div className="flex items-center justify-between rounded-md border px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">API Key</p>
          <p className="truncate font-mono text-sm">
            {apiKeyRevealed ? apiKey : maskedKey}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setApiKeyRevealed(!apiKeyRevealed)}
          >
            {apiKeyRevealed ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </Button>
          <CopyButton text={apiKey} />
        </div>
      </div>

      {/* Client tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as McpClientId)}>
        <TabsList className="w-full flex-wrap h-auto gap-1">
          <TabsTrigger value="cursor">Cursor</TabsTrigger>
          <TabsTrigger value="vscode">VS Code</TabsTrigger>
          <TabsTrigger value="claude-code">Claude Code</TabsTrigger>
          <TabsTrigger value="claude-desktop">Claude Desktop</TabsTrigger>
          <TabsTrigger value="chatgpt">ChatGPT</TabsTrigger>
          <TabsTrigger value="windsurf">Windsurf</TabsTrigger>
          <TabsTrigger value="universal">Universal</TabsTrigger>
        </TabsList>

        <TabsContent value="cursor">
          <DeeplinkCard
            name="Cursor"
            description="One-click install via Cursor deeplink"
            deeplink={getCursorDeeplink(mcpUrl, apiKey)}
            mcpUrl={mcpUrl}
            apiKey={apiKey}
          />
        </TabsContent>

        <TabsContent value="vscode">
          <DeeplinkCard
            name="VS Code"
            description="One-click install via VS Code deeplink"
            deeplink={getVSCodeDeeplink(mcpUrl, apiKey)}
            mcpUrl={mcpUrl}
            apiKey={apiKey}
          />
        </TabsContent>

        <TabsContent value="claude-code">
          <CommandCard
            name="Claude Code"
            description="Run this command in your terminal"
            command={getClaudeCodeCommand(mcpUrl, apiKey)}
          />
        </TabsContent>

        <TabsContent value="claude-desktop">
          <JsonConfigCard
            name="Claude Desktop"
            description="Add this to your Claude Desktop config file"
            config={getClaudeDesktopConfig(mcpUrl, apiKey)}
            getConfigPath={getClaudeDesktopConfigPath}
          />
        </TabsContent>

        <TabsContent value="chatgpt">
          <ChatGPTCard mcpUrl={mcpUrl} apiKey={apiKey} />
        </TabsContent>

        <TabsContent value="windsurf">
          <JsonConfigCard
            name="Windsurf"
            description="Add this to your Windsurf MCP config file"
            config={getWindsurfConfig(mcpUrl, apiKey)}
            getConfigPath={getWindsurfConfigPath}
          />
        </TabsContent>

        <TabsContent value="universal">
          <CommandCard
            name="Universal (npx add-mcp)"
            description="Works with any MCP-compatible client"
            command={getUniversalCommand(mcpUrl, apiKey)}
          />
        </TabsContent>
      </Tabs>

      {/* Action buttons */}
      <div className="flex flex-col gap-3">
        <Button onClick={onComplete} className="w-full" size="lg">
          Complete Setup
        </Button>
        <Button
          variant="ghost"
          onClick={onSkip}
          className="w-full text-muted-foreground"
        >
          Skip for now
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopy}>
      {copied ? (
        <Check className="h-4 w-4 text-green-600" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </Button>
  );
}

function DeeplinkCard({
  name,
  description,
  deeplink,
  mcpUrl,
  apiKey,
}: {
  name: string;
  description: string;
  deeplink: string;
  mcpUrl: string;
  apiKey: string;
}) {
  return (
    <Card className="mt-3">
      <CardHeader>
        <CardTitle className="text-base">{name}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button asChild className="w-full" size="lg">
          <a href={deeplink}>
            <ExternalLink className="h-4 w-4" />
            Install in {name}
          </a>
        </Button>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Or configure manually with these values:
          </p>
          <div className="space-y-1">
            <LabeledCopyField label="Server URL" value={mcpUrl} />
            <LabeledCopyField
              label="Authorization"
              value={`Bearer ${apiKey}`}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CommandCard({
  name,
  description,
  command,
}: {
  name: string;
  description: string;
  command: string;
}) {
  return (
    <Card className="mt-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Terminal className="h-4 w-4" />
          {name}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 overflow-x-auto rounded-md border bg-muted px-3 py-2">
            <pre className="whitespace-pre-wrap break-all font-mono text-sm">
              {command}
            </pre>
          </div>
          <CopyButton text={command} />
        </div>
      </CardContent>
    </Card>
  );
}

function JsonConfigCard({
  name,
  description,
  config,
  getConfigPath,
}: {
  name: string;
  description: string;
  config: string;
  getConfigPath: (os: "mac" | "windows" | "linux") => string;
}) {
  const [selectedOs, setSelectedOs] = useState<"mac" | "windows" | "linux">(
    "mac"
  );

  return (
    <Card className="mt-3">
      <CardHeader>
        <CardTitle className="text-base">{name}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* OS selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">OS:</span>
          <div className="flex gap-1">
            {(["mac", "windows", "linux"] as const).map((os) => (
              <Badge
                key={os}
                variant={selectedOs === os ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setSelectedOs(os)}
              >
                {os === "mac" ? "macOS" : os === "windows" ? "Windows" : "Linux"}
              </Badge>
            ))}
          </div>
        </div>

        {/* Config file path */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Config file location:</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border bg-muted px-2 py-1 text-xs font-mono">
              {getConfigPath(selectedOs)}
            </code>
            <CopyButton text={getConfigPath(selectedOs)} />
          </div>
        </div>

        {/* JSON config */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Add to your config file:
          </p>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1 overflow-x-auto rounded-md border bg-muted px-3 py-2">
              <pre className="whitespace-pre-wrap break-all font-mono text-xs">
                {config}
              </pre>
            </div>
            <CopyButton text={config} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ChatGPTCard({
  mcpUrl,
  apiKey,
}: {
  mcpUrl: string;
  apiKey: string;
}) {
  const instructions = getChatGPTInstructions();

  return (
    <Card className="mt-3">
      <CardHeader>
        <CardTitle className="text-base">ChatGPT</CardTitle>
        <CardDescription>
          Follow these steps to connect ChatGPT to your MCP server
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="space-y-2">
          {instructions.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                {i + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
        <div className="space-y-1">
          <LabeledCopyField label="Server URL" value={mcpUrl} />
          <LabeledCopyField label="API Key" value={apiKey} />
        </div>
      </CardContent>
    </Card>
  );
}

function LabeledCopyField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">
        {label}:
      </span>
      <code className="min-w-0 flex-1 truncate rounded-md border bg-muted px-2 py-1 text-xs font-mono">
        {value}
      </code>
      <CopyButton text={value} />
    </div>
  );
}

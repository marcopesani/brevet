"use client";

import { useState } from "react";
import {
  Copy,
  Check,
  Terminal,
  MessageSquare,
  MousePointer,
  Bot,
  RotateCw,
  AlertTriangle,
  KeyRound,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { regenerateApiKey } from "@/app/actions/api-key";
import type { McpToolDescriptor } from "@/lib/mcp/tool-registry";

interface McpInstallGuideProps {
  humanHash: string;
  apiKeyPrefix: string | null;
  tools: McpToolDescriptor[];
}

function CopyButton({
  text,
  label = "Copy",
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
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
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className={className}
    >
      {copied ? (
        <>
          <Check className="size-4" />
          Copied!
        </>
      ) : (
        <>
          <Copy className="size-4" />
          {label}
        </>
      )}
    </Button>
  );
}

function CodeBlock({
  children,
  copyText,
}: {
  children: string;
  copyText?: string;
}) {
  return (
    <div className="group/code relative">
      <pre className="bg-muted overflow-x-auto rounded-md border px-3 py-2 pr-16 font-mono text-sm">
        {children}
      </pre>
      <div className="absolute top-1.5 right-2">
        <CopyButton text={copyText ?? children} label="Copy" />
      </div>
    </div>
  );
}

function Step({
  number,
  children,
}: {
  number: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium">
        {number}
      </div>
      <div className="min-w-0 flex-1 pt-0.5 text-sm">{children}</div>
    </div>
  );
}

function ApiKeyInline({
  apiKeyPrefix,
  apiKey,
  onKeyGenerated,
}: {
  apiKeyPrefix: string | null;
  apiKey: string | null;
  onKeyGenerated: (key: string) => void;
}) {
  const [isRotating, setIsRotating] = useState(false);

  const handleGenerate = async () => {
    setIsRotating(true);
    const result = await regenerateApiKey();
    if (result.success) {
      onKeyGenerated(result.data.rawKey);
    } else {
      toast.error(result.error);
    }
    setIsRotating(false);
  };

  if (apiKey) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded-md border border-yellow-500/20 bg-yellow-500/10 p-3">
          <AlertTriangle className="size-4 shrink-0 text-yellow-600" />
          <p className="text-sm text-yellow-600">
            Save this key now — it won&apos;t be shown again.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-muted min-w-0 flex-1 rounded-md border px-3 py-2">
            <p className="truncate font-mono text-sm">{apiKey}</p>
          </div>
          <CopyButton text={apiKey} />
        </div>
      </div>
    );
  }

  if (!apiKeyPrefix) {
    return (
      <div className="rounded-md border border-dashed p-4 text-center">
        <KeyRound className="text-muted-foreground mx-auto mb-2 size-5" />
        <p className="text-muted-foreground mb-3 text-sm">
          Generate an API key to see your complete install instructions.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" disabled={isRotating}>
              <KeyRound className="size-4" />
              Generate API Key
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Generate API Key?</AlertDialogTitle>
              <AlertDialogDescription>
                This will generate a new API key for authenticating with your MCP
                endpoint.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleGenerate}>
                Generate Key
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="bg-muted min-w-0 flex-1 rounded-md border px-3 py-2">
        <p className="font-mono text-sm">
          {apiKeyPrefix}
          <span className="text-muted-foreground">••••••••</span>
        </p>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={isRotating}>
            <RotateCw className="size-4" />
            Rotate
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotate API Key?</AlertDialogTitle>
            <AlertDialogDescription>
              This will invalidate your current API key. Any agents using the old
              key will stop working immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleGenerate} variant="destructive">
              Rotate Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function McpInstallGuide({
  humanHash,
  apiKeyPrefix,
  tools,
}: McpInstallGuideProps) {
  const [apiKey, setApiKey] = useState<string | null>(null);

  const baseUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/mcp/${humanHash}`
      : `/api/mcp/${humanHash}`;

  const keyPlaceholder = apiKey ?? "YOUR_API_KEY";
  const hasKey = !!apiKey || !!apiKeyPrefix;

  const cursorConfig = JSON.stringify({
    url: baseUrl,
    headers: { Authorization: `Bearer ${keyPlaceholder}` },
  });
  const cursorDeeplink = `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent("Brevet")}&config=${encodeURIComponent(btoa(cursorConfig))}`;

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>Connect Brevet to your AI</CardTitle>
        <CardDescription>
          Choose your AI client below and follow the steps to connect.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* API Key Section */}
        <ApiKeyInline
          apiKeyPrefix={apiKeyPrefix}
          apiKey={apiKey}
          onKeyGenerated={setApiKey}
        />

        {/* Client Tabs */}
        <Tabs defaultValue="claude">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
            <TabsTrigger value="claude">
              <MessageSquare className="size-4" />
              Claude
            </TabsTrigger>
            <TabsTrigger value="chatgpt">
              <Bot className="size-4" />
              ChatGPT
            </TabsTrigger>
            <TabsTrigger value="claude-code">
              <Terminal className="size-4" />
              <span className="hidden sm:inline">Claude Code</span>
              <span className="sm:hidden">CLI</span>
            </TabsTrigger>
            <TabsTrigger value="cursor">
              <MousePointer className="size-4" />
              Cursor
            </TabsTrigger>
          </TabsList>

          {/* Claude.ai / Claude Desktop */}
          <TabsContent value="claude" className="mt-4 space-y-4">
            <div className="space-y-4">
              <Step number={1}>
                <p>
                  Open <strong>Settings</strong> in the sidebar, then go to{" "}
                  <strong>Connectors</strong>.
                </p>
              </Step>
              <Step number={2}>
                <p>
                  Click <strong>Add custom connector</strong> and set the name to{" "}
                  <code className="bg-muted rounded px-1 py-0.5 text-xs">
                    Brevet
                  </code>
                  .
                </p>
              </Step>
              <Step number={3}>
                <p className="mb-2">Paste this URL (includes your API key):</p>
                <CodeBlock copyText={`${baseUrl}?api_key=${keyPlaceholder}`}>
                  {`${baseUrl}?api_key=${keyPlaceholder}`}
                </CodeBlock>
              </Step>
            </div>
            {!hasKey && (
              <p className="text-muted-foreground text-xs">
                Generate an API key above to get your personalized instructions.
              </p>
            )}
          </TabsContent>

          {/* ChatGPT */}
          <TabsContent value="chatgpt" className="mt-4 space-y-4">
            <div className="space-y-4">
              <Step number={1}>
                <p>
                  Enable{" "}
                  <strong>
                    Settings &rarr; Connectors &rarr; Advanced settings &rarr;
                    Developer mode
                  </strong>
                  .
                </p>
              </Step>
              <Step number={2}>
                <p>
                  In the <strong>Connectors</strong> tab, click{" "}
                  <strong>Create</strong>.
                </p>
              </Step>
              <Step number={3}>
                <p className="mb-2">
                  Set the name to{" "}
                  <code className="bg-muted rounded px-1 py-0.5 text-xs">
                    Brevet
                  </code>{" "}
                  and paste this MCP server URL:
                </p>
                <CodeBlock copyText={baseUrl}>{baseUrl}</CodeBlock>
              </Step>
              <Step number={4}>
                <p className="mb-2">
                  Set Authentication to <strong>API Key</strong> and paste your
                  key:
                </p>
                <CodeBlock copyText={keyPlaceholder}>
                  {keyPlaceholder}
                </CodeBlock>
              </Step>
              <Step number={5}>
                <p>
                  Click <strong>Create</strong>. Brevet will appear in the
                  composer under &ldquo;Developer mode&rdquo; tools.
                </p>
              </Step>
            </div>
            {!hasKey && (
              <p className="text-muted-foreground text-xs">
                Generate an API key above to get your personalized instructions.
              </p>
            )}
          </TabsContent>

          {/* Claude Code */}
          <TabsContent value="claude-code" className="mt-4 space-y-4">
            <div className="space-y-4">
              <Step number={1}>
                <p className="mb-2">
                  Run this command in your terminal to add the Brevet MCP server:
                </p>
                <CodeBlock
                  copyText={`claude mcp add --transport http brevet ${baseUrl} -h "Authorization: Bearer ${keyPlaceholder}"`}
                >{`claude mcp add --transport http brevet \\\n  ${baseUrl} \\\n  -h "Authorization: Bearer ${keyPlaceholder}"`}</CodeBlock>
              </Step>
              <Step number={2}>
                <p>
                  Start Claude Code and run{" "}
                  <code className="bg-muted rounded px-1 py-0.5 text-xs">
                    /mcp
                  </code>{" "}
                  to verify the connection.
                </p>
              </Step>
            </div>
            {!hasKey && (
              <p className="text-muted-foreground text-xs">
                Generate an API key above to get your personalized instructions.
              </p>
            )}
          </TabsContent>

          {/* Cursor */}
          <TabsContent value="cursor" className="mt-4 space-y-4">
            {hasKey && (
              <div className="rounded-md border border-dashed p-4 text-center">
                <p className="text-muted-foreground mb-3 text-sm">
                  Install with one click — opens Cursor and adds the server
                  automatically.
                </p>
                <a href={cursorDeeplink}>
                  <Button size="sm">
                    <MousePointer className="size-4" />
                    Install in Cursor
                  </Button>
                </a>
              </div>
            )}
            <div className="space-y-4">
              {hasKey && (
                <p className="text-muted-foreground text-xs font-medium">
                  Or add manually:
                </p>
              )}
              <Step number={1}>
                <p className="mb-2">
                  Add this to your project&apos;s{" "}
                  <code className="bg-muted rounded px-1 py-0.5 text-xs">
                    .cursor/mcp.json
                  </code>{" "}
                  file:
                </p>
                <CodeBlock
                  copyText={JSON.stringify(
                    {
                      mcpServers: {
                        brevet: {
                          url: baseUrl,
                          headers: {
                            Authorization: `Bearer ${keyPlaceholder}`,
                          },
                        },
                      },
                    },
                    null,
                    2
                  )}
                >
                  {JSON.stringify(
                    {
                      mcpServers: {
                        brevet: {
                          url: baseUrl,
                          headers: {
                            Authorization: `Bearer ${keyPlaceholder}`,
                          },
                        },
                      },
                    },
                    null,
                    2
                  )}
                </CodeBlock>
              </Step>
              <Step number={2}>
                <p>
                  Restart Cursor. The Brevet MCP tools will appear in your agent
                  panel.
                </p>
              </Step>
            </div>
            {!hasKey && (
              <p className="text-muted-foreground text-xs">
                Generate an API key above to get your personalized instructions.
              </p>
            )}
          </TabsContent>
        </Tabs>

      </CardContent>
    </Card>

    {/* Available Tools */}
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Available tools ({tools.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {tools.map((tool) => (
            <Badge key={tool.name} variant="secondary" title={tool.summary}>
              {tool.name}
            </Badge>
          ))}
        </div>
        <div className="mt-3 space-y-1">
          {tools.map((tool) => (
            <p key={tool.name} className="text-muted-foreground text-xs">
              <code className="text-foreground font-medium">{tool.name}</code>{" "}
              — {tool.summary}
            </p>
          ))}
        </div>
      </CardContent>
    </Card>

    {/* Authentication Reference */}
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Authentication reference</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-muted-foreground space-y-2 text-sm">
          <p>Two ways to authenticate requests:</p>
          <div className="bg-muted rounded-md border px-3 py-2">
            <p className="font-mono text-xs">
              Authorization: Bearer {"<your-api-key>"}
            </p>
          </div>
          <p>
            Or as a query parameter:{" "}
            <code className="text-xs">?api_key=brv_...</code>
          </p>
        </div>
      </CardContent>
    </Card>

    {/* Testing with MCP Inspector */}
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Testing with MCP Inspector</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-muted-foreground space-y-2 text-sm">
          <p>
            Use the MCP Inspector CLI to test your endpoint:
          </p>
          <CodeBlock
            copyText={`npx @anthropic-ai/mcp-inspector --transport http --url ${baseUrl} -h "Authorization: Bearer ${keyPlaceholder}"`}
          >{`npx @anthropic-ai/mcp-inspector \\\n  --transport http \\\n  --url ${baseUrl} \\\n  -h "Authorization: Bearer ${keyPlaceholder}"`}</CodeBlock>
        </div>
      </CardContent>
    </Card>
    </>
  );
}

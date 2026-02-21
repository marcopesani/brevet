"use client";

import { useState } from "react";
import { Copy, Check, RotateCw, AlertTriangle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { regenerateApiKey } from "@/app/actions/api-key";

interface ApiKeyCardProps {
  apiKeyPrefix: string | null;
}

export function ApiKeyCard({ apiKeyPrefix }: ApiKeyCardProps) {
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isRotating, setIsRotating] = useState(false);

  const handleRotate = async () => {
    setIsRotating(true);
    try {
      const { rawKey } = await regenerateApiKey();
      setNewKey(rawKey);
      setCopied(false);
    } finally {
      setIsRotating(false);
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
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
        <CardTitle>API Key</CardTitle>
        <CardDescription>
          Use this key to authenticate AI agents with your MCP endpoint.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {newKey ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-md border border-yellow-500/20 bg-yellow-500/10 p-3">
              <AlertTriangle className="size-4 shrink-0 text-yellow-600" />
              <p className="text-sm text-yellow-600">
                Save this key now — it won&apos;t be shown again.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="bg-muted min-w-0 flex-1 rounded-md border px-3 py-2">
                <p className="truncate font-mono text-sm">{newKey}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy(newKey)}
              >
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
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="bg-muted min-w-0 flex-1 rounded-md border px-3 py-2">
              <p className="font-mono text-sm">
                {apiKeyPrefix ? (
                  <>
                    {apiKeyPrefix}
                    <span className="text-muted-foreground">
                      ••••••••••••••••••••••••••••
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    No API key generated yet
                  </span>
                )}
              </p>
            </div>
          </div>
        )}

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={isRotating}>
              <RotateCw className="size-4" />
              {apiKeyPrefix && !newKey ? "Rotate Key" : "Generate Key"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {apiKeyPrefix && !newKey
                  ? "Rotate API Key?"
                  : "Generate API Key?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {apiKeyPrefix && !newKey
                  ? "This will invalidate your current API key. Any agents using the old key will stop working immediately."
                  : "This will generate a new API key for authenticating with your MCP endpoint."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRotate}
                variant="destructive"
              >
                {apiKeyPrefix && !newKey ? "Rotate Key" : "Generate Key"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

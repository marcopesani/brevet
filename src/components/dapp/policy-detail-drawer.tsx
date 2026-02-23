"use client";

import { Archive, Trash2, AlertTriangle, Copy, Check, Link } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { toast } from "sonner";

interface Policy {
  id: string;
  endpointPattern: string;
  autoSign: boolean;
  chainId: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

interface PolicyDetailDrawerProps {
  policy: Policy | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onArchive: (policy: Policy) => void;
}

export function PolicyDetailDrawer({
  policy,
  open,
  onOpenChange,
  onArchive,
}: PolicyDetailDrawerProps) {
  const [copied, setCopied] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  // Handle null policy gracefully
  if (!policy) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Policy Details</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6">
            <p className="text-muted-foreground">No policy selected</p>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  // TypeScript now knows policy is non-null
  const currentPolicy = policy;

  async function handleCopy() {
    await navigator.clipboard.writeText(currentPolicy.endpointPattern);
    setCopied(true);
    toast.success("Pattern copied");
    setTimeout(() => setCopied(false), 2000);

    // Haptic feedback
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(10);
    }
  }

  function handleArchive() {
    if (!confirmArchive) {
      setConfirmArchive(true);
      return;
    }
    onArchive(currentPolicy);
    setConfirmArchive(false);
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            Policy Details
          </DrawerTitle>
        </DrawerHeader>

        <div className="space-y-6 px-4 pb-6">
          {/* Pattern */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Endpoint Pattern</p>
            <div className="flex items-center gap-2 rounded-lg border bg-muted p-3">
              <code className="flex-1 text-sm break-all">{currentPolicy.endpointPattern}</code>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Status */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Status</p>
            <div className="flex items-center gap-2">
              <Badge variant={currentPolicy.autoSign ? "default" : "outline"}>
                {currentPolicy.autoSign ? "Auto-sign" : "Manual"}
              </Badge>
              <Badge variant={currentPolicy.archivedAt ? "secondary" : "outline"}>
                {currentPolicy.archivedAt ? "Archived" : "Active"}
              </Badge>
            </div>
          </div>

          {/* Meta */}
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>
              Created: {new Date(currentPolicy.createdAt).toLocaleDateString()}
            </p>
            <p>
              Updated: {new Date(currentPolicy.updatedAt).toLocaleDateString()}
            </p>
          </div>

          {/* Archive Action */}
          {!currentPolicy.archivedAt && (
            <div className="space-y-2">
              {confirmArchive && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <p>Are you sure? This will archive the policy.</p>
                </div>
              )}
              <Button
                variant={confirmArchive ? "destructive" : "outline"}
                className="w-full"
                onClick={handleArchive}
              >
                {confirmArchive ? (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Confirm Archive
                  </>
                ) : (
                  <>
                    <Archive className="mr-2 h-4 w-4" />
                    Archive Policy
                  </>
                )}
              </Button>
              {confirmArchive && (
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => setConfirmArchive(false)}
                >
                  Cancel
                </Button>
              )}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

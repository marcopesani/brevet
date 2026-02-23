"use client";

import { useState, useTransition } from "react";
import { Link, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { createPolicy } from "@/app/actions/policies";

interface AddPolicyDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chainId: number;
  onSuccess: () => void;
}

export function AddPolicyDrawer({
  open,
  onOpenChange,
  chainId,
  onSuccess,
}: AddPolicyDrawerProps) {
  const [pattern, setPattern] = useState("");
  const [autoSign, setAutoSign] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Reset when drawer opens
  useState(() => {
    if (open) {
      setPattern("");
      setAutoSign(false);
      setError(null);
      setSuccess(false);
    }
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pattern.trim()) return;

    setError(null);

    startTransition(async () => {
      try {
        const result = await createPolicy({
          endpointPattern: pattern.trim(),
          autoSign,
          chainId,
        });

        if (result.success) {
          setSuccess(true);
          onSuccess();

          // Haptic feedback
          if (typeof navigator !== "undefined" && navigator.vibrate) {
            navigator.vibrate([10, 50, 10]);
          }

          // Close after brief delay
          setTimeout(() => {
            onOpenChange(false);
            setSuccess(false);
            setPattern("");
            setAutoSign(false);
          }, 1500);
        } else {
          setError(result.error ?? "Failed to create policy");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create policy");
      }
    });
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add Policy
          </DrawerTitle>
        </DrawerHeader>

        <form onSubmit={handleSubmit} className="space-y-4 px-4 pb-6">
          {/* Pattern input */}
          <div className="space-y-2">
            <Label htmlFor="endpoint-pattern">Endpoint Pattern</Label>
            <Input
              id="endpoint-pattern"
              placeholder="*.example.com/* or https://api.example.com/*"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              disabled={isPending || success}
            />
            <p className="text-xs text-muted-foreground">
              Use * as wildcard. Example: *.api.com/payments/*
            </p>
          </div>

          {/* Auto-sign toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="auto-sign" className="text-sm">
                Auto-sign payments
              </Label>
              <p className="text-xs text-muted-foreground">
                Automatically approve payments from this endpoint
              </p>
            </div>
            <Switch
              id="auto-sign"
              checked={autoSign}
              onCheckedChange={setAutoSign}
              disabled={isPending || success}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="flex items-center gap-2 rounded-lg border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-600">
              <Check className="h-4 w-4" />
              Policy created!
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={!pattern.trim() || isPending || success}
            >
              {isPending ? "Creating..." : success ? "Created!" : "Create Policy"}
            </Button>
          </div>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { createPolicy } from "@/app/actions/policies";

interface AddPolicyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  chainId?: number;
}

export function AddPolicyDialog({
  open,
  onOpenChange,
  onSuccess,
  chainId,
}: AddPolicyDialogProps) {
  const [endpointPattern, setEndpointPattern] = useState("");
  const [autoSign, setAutoSign] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await createPolicy({ endpointPattern, autoSign, chainId });
      toast.success("Policy created");
      setEndpointPattern("");
      setAutoSign(false);
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create policy");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Endpoint Policy</DialogTitle>
          <DialogDescription>
            Create a new policy for an endpoint pattern. Use wildcards like{" "}
            <code className="text-xs">https://api.example.com/*</code>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="endpointPattern">Endpoint Pattern</Label>
            <Input
              id="endpointPattern"
              placeholder="https://api.example.com/*"
              value={endpointPattern}
              onChange={(e) => setEndpointPattern(e.target.value)}
              required
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="autoSign"
              checked={autoSign}
              onCheckedChange={setAutoSign}
            />
            <Label htmlFor="autoSign">Auto-sign payments</Label>
          </div>

          {error && (
            <p className="text-destructive text-sm">{error}</p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !endpointPattern}>
              {submitting ? "Creating..." : "Create Policy"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

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

interface AddPolicyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddPolicyDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddPolicyDialogProps) {
  const [endpointPattern, setEndpointPattern] = useState("");
  const [payFromHotWallet, setPayFromHotWallet] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpointPattern, payFromHotWallet }),
      });
      if (res.ok) {
        toast.success("Policy created");
        setEndpointPattern("");
        setPayFromHotWallet(false);
        onOpenChange(false);
        onSuccess();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to create policy");
      }
    } catch {
      setError("Network error");
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
              id="payFromHotWallet"
              checked={payFromHotWallet}
              onCheckedChange={setPayFromHotWallet}
            />
            <Label htmlFor="payFromHotWallet">Pay from hot wallet</Label>
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

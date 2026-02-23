"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DappError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("Dapp error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="text-center">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {error.message || "Failed to load the dapp"}
        </p>
        <Button onClick={reset} className="mt-4" variant="outline">
          Try again
        </Button>
      </div>
    </div>
  );
}

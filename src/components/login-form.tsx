"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAppKit } from "@reown/appkit/react";
import { useAccount } from "wagmi";
import { Wallet, Loader2, AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { useSIWE } from "@/hooks/useSIWE";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const { open } = useAppKit();
  const { address, isConnected, chainId } = useAccount();
  const { authenticate, status, error, reset } = useSIWE();
  const authStartedRef = useRef(false);

  // When wallet connects, automatically trigger SIWE once
  useEffect(() => {
    if (!isConnected || !address || !chainId || status !== "idle") return;
    if (authStartedRef.current) return;
    authStartedRef.current = true;
    authenticate(address, chainId).then((success) => {
      if (success) {
        router.push("/dashboard");
      } else {
        authStartedRef.current = false;
      }
    });
  }, [isConnected, address, chainId, status, authenticate, router]);

  const handleConnect = () => {
    authStartedRef.current = false;
    reset();
    open();
  };

  const handleRetry = () => {
    authStartedRef.current = false;
    reset();
    if (isConnected && address && chainId) {
      authStartedRef.current = true;
      authenticate(address, chainId).then((success) => {
        if (success) {
          router.push("/dashboard");
        } else {
          authStartedRef.current = false;
        }
      });
    } else {
      open();
    }
  };

  const isLoading =
    status === "fetching-nonce" ||
    status === "signing" ||
    status === "verifying";

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <div className="flex flex-col items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-md">
              <Wallet className="size-6" />
            </div>
            <CardTitle className="text-xl">Welcome to PayMCP</CardTitle>
            <CardDescription>
              Connect your wallet to manage AI agent payments
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {isLoading ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <Loader2 className="text-muted-foreground size-6 animate-spin" />
                <p className="text-muted-foreground text-sm">
                  {statusLabel(status)}
                </p>
              </div>
            ) : isConnected && address && status === "error" ? (
              <div className="flex flex-col gap-3">
                <p className="text-muted-foreground text-center text-sm">
                  Connected as{" "}
                  <span className="font-mono text-xs">
                    {address.slice(0, 6)}...{address.slice(-4)}
                  </span>
                </p>
                <Button onClick={handleRetry} className="w-full" size="lg">
                  Try Again
                </Button>
                <Button
                  onClick={handleConnect}
                  variant="outline"
                  className="w-full"
                  size="lg"
                >
                  Connect Different Wallet
                </Button>
              </div>
            ) : (
              <Button
                onClick={handleConnect}
                className="w-full"
                size="lg"
              >
                <Wallet className="mr-2 size-4" />
                Connect Wallet
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      <p className="text-muted-foreground px-6 text-center text-xs text-balance">
        By connecting, you agree to sign a message to verify wallet ownership.
        No transaction will be made.
      </p>
    </div>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case "fetching-nonce":
      return "Preparing sign-in...";
    case "signing":
      return "Please sign the message in your wallet...";
    case "verifying":
      return "Verifying signature...";
    default:
      return "Connecting...";
  }
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppKit } from "@reown/appkit/react";
import { useSession } from "next-auth/react";
import { Wallet, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const { open } = useAppKit();
  const { data: session, status } = useSession();

  // When session becomes active, redirect to dashboard
  useEffect(() => {
    if (session?.address) {
      router.push("/dashboard");
    }
  }, [session, router]);

  const isLoading = status === "loading";

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
            {isLoading ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <Loader2 className="text-muted-foreground size-6 animate-spin" />
                <p className="text-muted-foreground text-sm">Loading...</p>
              </div>
            ) : (
              <Button
                onClick={() => open()}
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

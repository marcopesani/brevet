"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppKit } from "@reown/appkit/react";
import { useSession, signOut } from "next-auth/react";
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

  useEffect(() => {
    if (status !== "authenticated") return;
    // Valid SIWE session has address; legacy/invalid sessions do not
    if (!session?.address) {
      signOut({ redirect: false });
      return;
    }
    router.push("/dashboard");
  }, [status, session?.address, session?.userId, router]);

  const isLoading = status === "loading";

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <div className="flex flex-col items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-md">
              <Wallet className="size-6" />
            </div>
            <CardTitle className="text-xl">Welcome to Brevet</CardTitle>
            <CardDescription>
              Connect your wallet to manage your agent&apos;s spending authority
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {isLoading ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <Loader2 className="text-muted-foreground size-6 animate-spin" />
                <p className="text-muted-foreground text-sm">Connecting...</p>
              </div>
            ) : (
              <Button
                onClick={() => open()}
                className="w-full"
                size="lg"
                data-testid="connect-wallet-button"
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

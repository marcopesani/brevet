"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppKit } from "@reown/appkit/react";
import { useSession, signIn, signOut, getCsrfToken } from "next-auth/react";
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
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const isTestMode = process.env.NEXT_PUBLIC_TEST_MODE === "true";

  useEffect(() => {
    if (status !== "authenticated") return;
    // Valid SIWE session has address; legacy/invalid sessions do not
    if (!session?.address) {
      signOut({ redirect: false });
      return;
    }
    router.push("/dashboard");
  }, [status, session?.address, session?.userId, router]);

  const isLoading = status === "loading" || isConnectingWallet;

  async function connectWalletInTestMode() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const provider = (window as any).ethereum as
      | { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }
      | undefined;

    if (!provider) {
      await open();
      return;
    }

    setIsConnectingWallet(true);

    try {
      const accounts = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[];
      const address = accounts[0];
      if (!address) throw new Error("No account returned from wallet provider");

      const chainIdHex = (await provider.request({
        method: "eth_chainId",
      })) as string;
      const chainId = Number.parseInt(chainIdHex, 16);
      if (!Number.isFinite(chainId)) {
        throw new Error(`Invalid chain id returned by wallet provider: ${chainIdHex}`);
      }

      const csrfToken = await getCsrfToken();
      if (!csrfToken) throw new Error("Unable to fetch CSRF token");

      const origin = window.location.origin;
      const host = window.location.host;
      const issuedAt = new Date().toISOString();

      const message = `${host} wants you to sign in with your Ethereum account:
${address}

Please sign with your account

URI: ${origin}
Version: 1
Chain ID: ${chainId}
Nonce: ${csrfToken}
Issued At: ${issuedAt}`;

      const signature = (await provider.request({
        method: "personal_sign",
        params: [message, address],
      })) as string;

      const result = await signIn("credentials", {
        message,
        signature,
        redirect: false,
        callbackUrl: "/dashboard",
      });

      if (!result?.ok) {
        throw new Error("Credentials sign-in failed");
      }

      router.push("/dashboard");
    } catch (error) {
      // Fall back to the regular AppKit flow for local manual use.
      console.warn("Test-mode direct wallet connect failed; falling back to AppKit", error);
      await open();
    } finally {
      setIsConnectingWallet(false);
    }
  }

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
                onClick={() => {
                  if (isTestMode) {
                    void connectWalletInTestMode();
                    return;
                  }

                  void open();
                }}
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

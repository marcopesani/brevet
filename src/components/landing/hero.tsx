import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { VERCEL_DEPLOY_URL } from "@/lib/deploy-url";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* CSS-only decorative background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.3)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.3)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
        <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="mx-auto max-w-5xl px-6 pb-24 pt-20 sm:pt-32 lg:pt-40">
        <div className="flex flex-col items-center text-center">
          <div className="flex flex-wrap justify-center gap-2 mb-8">
            <Badge variant="secondary">100% Open Source</Badge>
            <Badge variant="secondary">Multichain</Badge>
            <Badge variant="secondary">MCP Native</Badge>
            <Badge variant="secondary">Account Abstraction</Badge>
          </div>

          <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Pay with internet money
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
            The open-source MCP wallet that lets AI agents pay for APIs, data,
            and goods — from ChatGPT, Claude, or any MCP client.
          </p>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <div className="flex flex-col items-center gap-1">
              <Button asChild size="lg" className="text-base">
                <Link href="/login">
                  Try now
                  <ArrowRight />
                </Link>
              </Button>
              <span className="text-xs text-muted-foreground">(Base Sepolia)</span>
            </div>
            <Button asChild variant="outline" size="lg" className="text-base">
              <a href={VERCEL_DEPLOY_URL}>
                Deploy on Vercel
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

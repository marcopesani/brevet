import { Wallet, Settings, Zap } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const steps = [
  {
    step: 1,
    title: "Connect & Fund",
    description:
      "Connect your wallet and fund your hot wallet with USDC on Base. Your hot wallet handles small payments automatically.",
    icon: Wallet,
  },
  {
    step: 2,
    title: "Configure Your Agent",
    description:
      "Point your AI agent to the PayMCP MCP endpoint. Set per-endpoint spending policies to stay in control.",
    icon: Settings,
  },
  {
    step: 3,
    title: "Automatic Payments",
    description:
      "Your agent discovers 402-protected APIs and pays automatically. Large payments require your approval via WalletConnect.",
    icon: Zap,
  },
];

export function HowItWorks() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            How It Works
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Get your AI agents paying for APIs in three simple steps.
          </p>
        </div>

        <div className="mt-16 grid gap-8 sm:grid-cols-3">
          {steps.map(({ step, title, description, icon: Icon }) => (
            <Card key={step} className="relative">
              <CardHeader>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
                  {step}
                </div>
                <CardTitle className="flex items-center gap-2">
                  <Icon className="size-5 text-muted-foreground" />
                  {title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm leading-relaxed">
                  {description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

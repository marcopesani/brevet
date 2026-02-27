import { Rocket, Wallet, MessageSquare, ShoppingCart } from "lucide-react";
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
    title: "Deploy Brevet",
    description:
      "One-click deploy on Vercel. Your wallet is ready in under two minutes.",
    icon: Rocket,
  },
  {
    step: 2,
    title: "Create & Fund Your Smart Account",
    description:
      "Connect your wallet, deposit USDC. Small payments happen automatically.",
    icon: Wallet,
  },
  {
    step: 3,
    title: "Add MCP to Your Chat Client",
    description:
      "Point your AI agent to the Brevet MCP endpoint. Set spending policies to stay in control of every transaction.",
    icon: MessageSquare,
  },
  {
    step: 4,
    title: "Start Shopping",
    description:
      "Your agent finds paid services and pays automatically. Large purchases need your approval.",
    icon: ShoppingCart,
  },
];

export function HowItWorks() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Up and running in minutes
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Four steps from deploy to your first agent payment.
          </p>
        </div>

        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
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

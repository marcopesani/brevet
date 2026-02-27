import {
  Zap,
  Shield,
  MessageSquare,
  Globe,
  Smartphone,
  Compass,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const features = [
  {
    title: "Automatic Payments",
    description:
      "Your agent never stalls on a paywall. Small payments are signed automatically so tasks keep moving.",
    icon: Zap,
  },
  {
    title: "Spending Controls",
    description:
      "Set per-site budgets and limits. You decide how much any agent can spend, and where.",
    icon: Shield,
  },
  {
    title: "Works in ChatGPT & Claude",
    description:
      "Connect from any chat client, web app, or mobile device. No CLI required — just add the server URL.",
    icon: MessageSquare,
  },
  {
    title: "Multichain",
    description:
      "Pay with USDC on Ethereum, Base, Optimism, Polygon, and Arbitrum. More chains and tokens coming soon.",
    icon: Globe,
  },
  {
    title: "Mobile & Web Access",
    description:
      "Manage payments from your phone or browser. Unlike CLI-only wallets, brevet works wherever you chat.",
    icon: Smartphone,
  },
  {
    title: "Discovery Built In",
    description:
      "Your agent can find services that accept payments automatically. No need to hunt for compatible APIs.",
    icon: Compass,
  },
];

export function Features() {
  return (
    <section id="features" className="py-24 bg-muted/50">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Why brevet?
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Your agents pay for APIs, data, and services — on your terms, from
            any device.
          </p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ title, description, icon: Icon }) => (
            <Card key={title}>
              <CardHeader>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <CardTitle>{title}</CardTitle>
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

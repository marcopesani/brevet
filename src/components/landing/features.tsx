import {
  Zap,
  Shield,
  CheckCircle,
  History,
  Plug,
  Layers,
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
      "Hot wallet auto-signs small payments so your agents never stall on a 402 response.",
    icon: Zap,
  },
  {
    title: "Spending Controls",
    description:
      "Set per-endpoint policies with configurable limits to keep spending predictable.",
    icon: Shield,
  },
  {
    title: "Approval Workflow",
    description:
      "Larger payments surface for review. Approve or reject via WalletConnect on any device.",
    icon: CheckCircle,
  },
  {
    title: "Transaction History",
    description:
      "Full audit trail for every payment with on-chain verification through BaseScan.",
    icon: History,
  },
  {
    title: "MCP Integration",
    description:
      "Works with any MCP-compatible AI agent. Connect once, pay for any 402-enabled API.",
    icon: Plug,
  },
  {
    title: "Base Network",
    description:
      "Fast, cheap USDC transactions on Base L2. Sub-cent fees and near-instant settlement.",
    icon: Layers,
  },
];

export function Features() {
  return (
    <section id="features" className="py-24 bg-muted/50">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Built for agents that need to pay for things.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Spending controls, tiered signing, full audit trail. Everything your
            agents need to pay for APIs on your terms.
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

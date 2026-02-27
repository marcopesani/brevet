import { ShoppingBag, TrendingUp, Search } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const useCases = [
  {
    title: "Agentic Shopping on Bitrefill",
    description:
      "Your AI agent browses gift cards, mobile top-ups, and eSIMs on Bitrefill. It pays with crypto in one step, no human in the loop.",
    icon: ShoppingBag,
  },
  {
    title: "Crypto Alpha from Paid APIs",
    description:
      "Let trading bots access paid market data, on-chain analytics, and alpha signals. They pay per call. You spend only when there's signal.",
    icon: TrendingUp,
  },
  {
    title: "Discover and Pay via MCP",
    description:
      "Drop your Brevet MCP server into ChatGPT or any agent. It finds merchants that accept crypto, then pays on the spot.",
    icon: Search,
  },
];

export function UseCases() {
  return (
    <section className="py-24 bg-muted/50">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            What can your AI buy?
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Real-world scenarios where autonomous payments unlock new
            capabilities for your agents.
          </p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-3">
          {useCases.map(({ title, description, icon: Icon }) => (
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

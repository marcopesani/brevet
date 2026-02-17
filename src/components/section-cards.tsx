import { IconTrendingDown, IconTrendingUp } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { AnalyticsSummary } from "@/lib/data/analytics"

interface SectionCardsProps {
  summary: AnalyticsSummary
  wallet: { balance: string; address: string } | null
}

export function SectionCards({ summary, wallet }: SectionCardsProps) {
  const cards = [
    {
      label: "Today Spend",
      value: `$${summary.today.toFixed(2)}`,
      trend: summary.today > 0 ? "up" : null,
      footer: `${summary.totalTransactions} total transactions`,
      description: "Spending today",
    },
    {
      label: "This Week",
      value: `$${summary.thisWeek.toFixed(2)}`,
      trend: summary.thisWeek > summary.today ? "up" : "neutral",
      footer: `Avg $${summary.avgPaymentSize.toFixed(2)} per payment`,
      description: "Weekly spending",
    },
    {
      label: "This Month",
      value: `$${summary.thisMonth.toFixed(2)}`,
      trend: summary.thisMonth > 0 ? "up" : null,
      footer: "Month to date",
      description: "Monthly spending",
    },
    {
      label: "Hot Wallet Balance",
      value: wallet ? `$${wallet.balance}` : "N/A",
      trend: null,
      footer: wallet
        ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
        : "No wallet found",
      description: "USDC balance",
    },
  ]

  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-4 gap-4 px-4 *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} className="@container/card">
          <CardHeader>
            <CardDescription>{card.label}</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {card.value}
            </CardTitle>
            {card.trend === "up" && (
              <CardAction>
                <Badge variant="outline">
                  <IconTrendingUp />
                  Active
                </Badge>
              </CardAction>
            )}
            {card.trend === "neutral" && (
              <CardAction>
                <Badge variant="outline">
                  <IconTrendingDown />
                  Steady
                </Badge>
              </CardAction>
            )}
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="line-clamp-1 flex gap-2 font-medium">
              {card.description}
              {card.trend === "up" && <IconTrendingUp className="size-4" />}
            </div>
            <div className="text-muted-foreground">{card.footer}</div>
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}

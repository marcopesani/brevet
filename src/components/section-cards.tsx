import { IconTrendingDown, IconTrendingUp } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
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
      footer: `${summary.totalTransactions} total transactions`,
      description: "Spending today",
    },
    {
      label: "This Week",
      value: `$${summary.thisWeek.toFixed(2)}`,
      footer: `Avg $${summary.avgPaymentSize.toFixed(2)} per payment`,
      description: "Weekly spending",
    },
    {
      label: "This Month",
      value: `$${summary.thisMonth.toFixed(2)}`,
      footer: "Month to date",
      description: "Monthly spending",
    },
    {
      label: "Smart Account Balance",
      value: wallet ? `$${wallet.balance}` : "N/A",
      footer: wallet
        ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
        : "No account found",
      description: "USDC balance",
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} className="@container/card">
          <CardHeader>
            <CardDescription>{card.label}</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {card.value}
            </CardTitle>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="line-clamp-1 flex gap-2 font-medium">
              {card.description}
            </div>
            <div className="text-muted-foreground">{card.footer}</div>
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}

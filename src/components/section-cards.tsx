"use client"

import { useCallback, useEffect, useState } from "react"
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
import { Skeleton } from "@/components/ui/skeleton"

interface SummaryData {
  today: number
  thisWeek: number
  thisMonth: number
  totalTransactions: number
  avgPaymentSize: number
}

interface WalletData {
  address: string
  balance: string
}

export function SectionCards() {
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [wallet, setWallet] = useState<WalletData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const [analyticsRes, walletRes] = await Promise.all([
        fetch("/api/analytics"),
        fetch("/api/wallet/balance"),
      ])

      if (analyticsRes.ok) {
        const data = await analyticsRes.json()
        setSummary(data.summary)
      }
      if (walletRes.ok) {
        const data = await walletRes.json()
        setWallet(data)
      }
    } catch {
      // Network error — leave null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="@container/card">
            <CardHeader>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-32" />
            </CardHeader>
            <CardFooter className="flex-col items-start gap-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </CardFooter>
          </Card>
        ))}
      </div>
    )
  }

  const cards = [
    {
      label: "Today Spend",
      value: summary ? `$${summary.today.toFixed(2)}` : "$0.00",
      trend: summary && summary.today > 0 ? "up" : null,
      footer: `${summary?.totalTransactions ?? 0} total transactions`,
      description: "Spending today",
    },
    {
      label: "This Week",
      value: summary ? `$${summary.thisWeek.toFixed(2)}` : "$0.00",
      trend: summary && summary.thisWeek > summary.today ? "up" : "neutral",
      footer: `Avg $${summary?.avgPaymentSize.toFixed(2) ?? "0.00"} per payment`,
      description: "Weekly spending",
    },
    {
      label: "This Month",
      value: summary ? `$${summary.thisMonth.toFixed(2)}` : "$0.00",
      trend: summary && summary.thisMonth > 0 ? "up" : null,
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

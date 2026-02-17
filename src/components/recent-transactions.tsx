import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getRecentTransactions } from "@/lib/data/transactions"

function statusVariant(status: string) {
  switch (status) {
    case "completed":
    case "settled":
      return "default" as const
    case "pending":
      return "secondary" as const
    case "failed":
      return "destructive" as const
    default:
      return "outline" as const
  }
}

export async function RecentTransactions({ userId }: { userId: string }) {
  const transactions = await getRecentTransactions(userId, 5)

  return (
    <div className="px-4 lg:px-6">
      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
          <CardDescription>Last 5 transactions</CardDescription>
          <CardAction>
            <Link
              href="/dashboard/history"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              View all
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-muted-foreground">
              No transactions yet
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-muted-foreground">
                      {new Date(tx.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate font-mono text-xs">
                      {tx.endpoint}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      ${tx.amount.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(tx.status)}>
                        {tx.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

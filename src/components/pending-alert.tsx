import Link from "next/link"
import { AlertCircle } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { getPendingCount } from "@/lib/data/payments"

export async function PendingAlert({ userId }: { userId: string }) {
  const count = await getPendingCount(userId)

  if (count === 0) {
    return null
  }

  return (
    <div className="px-4 lg:px-6">
      <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
        <AlertCircle className="size-4" />
        <AlertTitle>
          {count} pending payment{count !== 1 ? "s" : ""} awaiting approval
        </AlertTitle>
        <AlertDescription>
          <Link
            href="/dashboard/pending"
            className="underline underline-offset-4 hover:text-amber-800 dark:hover:text-amber-100"
          >
            Review pending payments
          </Link>
        </AlertDescription>
      </Alert>
    </div>
  )
}

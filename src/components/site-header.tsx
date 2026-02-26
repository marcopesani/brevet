"use client"

import { usePathname } from "next/navigation"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { RpcStatusIndicator } from "@/components/rpc-status-indicator"

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/pending": "Pending Payments",
  "/dashboard/policies": "Policies",
  "/dashboard/transactions": "Transactions",
  "/dashboard/wallet": "Account",
  "/dashboard/history": "History",
  "/dashboard/settings": "Settings",
}

export function SiteHeader() {
  const pathname = usePathname()
  const title = pageTitles[pathname] ?? "Dashboard"

  return (
    <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 bg-sidebar">
      <div className="flex w-full items-center gap-1 px-4 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium">{title}</h1>
        <RpcStatusIndicator />
      </div>
    </header>
  )
}

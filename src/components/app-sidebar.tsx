"use client"

import * as React from "react"
import {
  LayoutDashboard,
  Clock,
  Shield,
  ArrowUpDown,
  Wallet,
  Settings,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import Link from "next/link"
import { usePathname } from "next/navigation"

function usePendingCount() {
  const [count, setCount] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false

    async function fetchCount() {
      try {
        const res = await fetch("/api/payments/pending")
        if (res.ok) {
          const payments = await res.json()
          if (!cancelled) setCount(Array.isArray(payments) ? payments.length : 0)
        }
      } catch {
        // silently ignore fetch errors
      }
    }

    fetchCount()
    const interval = setInterval(fetchCount, 30_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return count
}

export function AppSidebar({
  walletAddress,
  ...props
}: React.ComponentProps<typeof Sidebar> & { walletAddress: string }) {
  const pendingCount = usePendingCount()
  const pathname = usePathname()

  const navMain = [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      title: "Pending Payments",
      url: "/dashboard/pending",
      icon: Clock,
      badge: pendingCount,
    },
    {
      title: "Policies",
      url: "/dashboard/policies",
      icon: Shield,
    },
    {
      title: "Transactions",
      url: "/dashboard/transactions",
      icon: ArrowUpDown,
    },
    {
      title: "Wallet",
      url: "/dashboard/wallet",
      icon: Wallet,
    },
  ]

  const isSettingsActive = pathname === "/dashboard/settings"

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <Link href="/dashboard">
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-5 items-center justify-center rounded-md text-xs font-bold">
                  P
                </div>
                <span className="text-base font-semibold">PayMCP</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isSettingsActive} tooltip="Settings">
                  <Link href="/dashboard/settings">
                    <Settings />
                    <span>Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser walletAddress={walletAddress} />
      </SidebarFooter>
    </Sidebar>
  )
}

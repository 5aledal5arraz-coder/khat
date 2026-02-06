"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Megaphone,
  PlayCircle,
  ArrowRight,
  Users,
  Inbox,
  Settings,
  PanelLeftClose,
  PanelLeft,
  Shield,
} from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const navItems = [
  { href: "/admin", icon: LayoutDashboard, label: "الرئيسية" },
  { href: "/admin/episodes", icon: PlayCircle, label: "الحلقات" },
  { href: "/admin/guests", icon: Users, label: "الضيوف" },
  { href: "/admin/submissions", icon: Inbox, label: "الطلبات" },
  { href: "/admin/moderation", icon: Shield, label: "الإشراف" },
  { href: "/admin/ads", icon: Megaphone, label: "الإعلانات" },
  { href: "/admin/settings", icon: Settings, label: "الإعدادات" },
]

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Admin Header */}
      <header className="sticky top-0 z-50 border-b bg-background shadow-sm">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="shrink-0"
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-5 w-5" />
              ) : (
                <PanelLeft className="h-5 w-5" />
              )}
            </Button>
            <div className="flex items-center gap-3">
              <Image
                src="/logo.png"
                alt="KHAT"
                width={32}
                height={32}
                className="rounded"
              />
              <h1 className="font-bold text-lg">لوحة التحكم</h1>
            </div>
          </div>
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>العودة للموقع</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={cn(
            "sticky top-14 h-[calc(100vh-3.5rem)] shrink-0 border-e bg-background transition-all duration-300",
            sidebarOpen ? "w-56" : "w-16"
          )}
        >
          <nav className="flex flex-col gap-1 p-3">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/admin" && pathname.startsWith(item.href))

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all",
                    isActive
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  title={!sidebarOpen ? item.label : undefined}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  {sidebarOpen && <span>{item.label}</span>}
                </Link>
              )
            })}
          </nav>
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}

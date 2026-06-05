"use client"

import Link from "next/link"
import Image from "next/image"
import { useState, useEffect, useCallback } from "react"
import { usePathname } from "next/navigation"
import {
  ArrowRight,
  PanelLeftClose,
  PanelLeft,
  Menu,
  X,
  LogOut,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { AdminSidebar } from "./components/admin-sidebar"
import { Breadcrumbs } from "./components/breadcrumbs"
import { AiDegradedBanner } from "./components/ai-degraded-banner"
import { BreadcrumbLabelProvider } from "@/lib/admin/breadcrumb-context"
import type { AiDegradedState } from "@/lib/ops/ai-degraded"

export default function AdminLayoutClient({
  children,
  userRole,
  aiDegraded,
}: {
  children: React.ReactNode
  userRole?: string
  /** A10 — server-fetched degraded-state. Banner renders when truthy. */
  aiDegraded?: AiDegradedState
}) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = useCallback(async () => {
    setLoggingOut(true)
    try {
      await fetch('/api/admin/auth/session', { method: 'DELETE' })
    } catch {}
    window.location.href = '/admin/login'
  }, [])

  // Close mobile drawer on route change
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setMobileDrawerOpen(false)
  }, [pathname])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileDrawerOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [mobileDrawerOpen])

  const closeMobileDrawer = useCallback(() => {
    setMobileDrawerOpen(false)
  }, [])

  return (
    <BreadcrumbLabelProvider>
    <div className="min-h-screen bg-background">
      {/* Admin Header */}
      <header className="admin-glass sticky top-0 z-40 border-b border-border/40">
        <div className="flex h-14 items-center justify-between px-4 lg:px-5">
          <div className="flex items-center gap-3">
            {/* Desktop: sidebar toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="hidden h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground lg:flex"
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-[18px] w-[18px]" />
              ) : (
                <PanelLeft className="h-[18px] w-[18px]" />
              )}
            </Button>

            {/* Mobile: hamburger */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileDrawerOpen(true)}
              className="h-9 w-9 shrink-0 text-muted-foreground lg:hidden"
            >
              <Menu className="h-[18px] w-[18px]" />
            </Button>

            {/* Logo + Title */}
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <Image
                  src="/logo.png"
                  alt="KHAT"
                  width={26}
                  height={26}
                  className="rounded-md"
                />
              </div>
              <div className="flex items-center gap-2">
                <h1 className="text-[13px] font-semibold tracking-tight">لوحة التحكم</h1>
                <span className="rounded-[5px] bg-primary/10 px-1.5 py-[1px] text-[9px] font-bold tracking-wider text-primary hidden sm:inline-block">
                  ADMIN
                </span>
              </div>
            </div>

            {/* Breadcrumbs separator + breadcrumbs */}
            <div className="hidden items-center gap-2 lg:flex">
              <div className="h-4 w-px bg-border/60" />
              <Breadcrumbs />
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              disabled={loggingOut}
              className="h-8 gap-2 px-2.5 text-xs text-muted-foreground hover:text-destructive"
              title="تسجيل الخروج"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">خروج</span>
            </Button>
            <div className="mx-1 h-4 w-px bg-border/40 hidden sm:block" />
            <Link href="/">
              <Button variant="ghost" size="sm" className="h-8 gap-2 px-2.5 text-xs text-muted-foreground">
                <span className="hidden sm:inline">الموقع</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* A10 — AI-degraded banner. Renders directly under the sticky
          header so it stays visible during operator scroll. Returns
          null when the system is healthy — no layout slot reserved,
          no flicker. */}
      {aiDegraded ? <AiDegradedBanner state={aiDegraded} /> : null}

      <div className="flex">
        {/* Desktop Sidebar */}
        <aside
          className={cn(
            "sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 border-e border-border/40 bg-background/80 transition-all duration-300 ease-in-out lg:block",
            sidebarOpen ? "w-56" : "w-[60px]"
          )}
        >
          <div className="h-full overflow-y-auto scrollbar-hide">
            <AdminSidebar collapsed={!sidebarOpen} userRole={userRole} />
          </div>
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1 p-4 lg:p-6">
          <div className="admin-animate-in">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Drawer Overlay */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={closeMobileDrawer}
          />
          {/* Drawer panel - slides from right (RTL) */}
          <div className="absolute inset-y-0 end-0 w-72 bg-background shadow-2xl animate-in slide-in-from-right duration-300">
            {/* Drawer header */}
            <div className="flex h-14 items-center justify-between border-b border-border/40 px-4">
              <div className="flex items-center gap-2.5">
                <Image
                  src="/logo.png"
                  alt="KHAT"
                  width={26}
                  height={26}
                  className="rounded-md"
                />
                <span className="text-[13px] font-semibold tracking-tight">لوحة التحكم</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={closeMobileDrawer}
                className="h-8 w-8 text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {/* Drawer nav */}
            <div className="h-[calc(100vh-3.5rem)] overflow-y-auto scrollbar-hide">
              <AdminSidebar collapsed={false} onNavClick={closeMobileDrawer} userRole={userRole} />
            </div>
          </div>
        </div>
      )}
    </div>
    </BreadcrumbLabelProvider>
  )
}

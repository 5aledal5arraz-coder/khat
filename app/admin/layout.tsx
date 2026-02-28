"use client"

import Link from "next/link"
import Image from "next/image"
import { useState, useEffect, useCallback } from "react"
import { usePathname, useRouter } from "next/navigation"
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

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const isLoginPage = pathname === '/admin/login'

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileDrawerOpen(false)
  }, [pathname])

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

  const handleLogout = useCallback(async () => {
    await fetch('/api/admin/auth/session', { method: 'DELETE' })
    router.push('/admin/login')
    router.refresh()
  }, [router])

  // Skip dashboard chrome for login page
  if (isLoginPage) return <>{children}</>

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Admin Header */}
      <header className="sticky top-0 z-40 border-b bg-background/95 shadow-sm backdrop-blur-sm">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            {/* Desktop: sidebar toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="hidden shrink-0 lg:flex"
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-5 w-5" />
              ) : (
                <PanelLeft className="h-5 w-5" />
              )}
            </Button>

            {/* Mobile: hamburger */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileDrawerOpen(true)}
              className="shrink-0 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </Button>

            <div className="flex items-center gap-3">
              <Image
                src="/logo.png"
                alt="KHAT"
                width={28}
                height={28}
                className="rounded"
              />
              <h1 className="text-base font-semibold">لوحة التحكم</h1>
            </div>

            {/* Breadcrumbs - desktop only */}
            <div className="hidden lg:block">
              <Breadcrumbs />
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">تسجيل الخروج</span>
            </Button>
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                <span className="hidden sm:inline">العودة للموقع</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Desktop Sidebar */}
        <aside
          className={cn(
            "sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 border-e bg-background transition-all duration-300 lg:block",
            sidebarOpen ? "w-56" : "w-16"
          )}
        >
          <div className="h-full overflow-y-auto">
            <AdminSidebar collapsed={!sidebarOpen} />
          </div>
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1 p-4 lg:p-6">
          <div className="animate-in fade-in slide-in-from-bottom-1 duration-200">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Drawer Overlay */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeMobileDrawer}
          />
          {/* Drawer panel - slides from right (RTL) */}
          <div className="absolute inset-y-0 end-0 w-72 bg-background shadow-2xl animate-in slide-in-from-right duration-300">
            {/* Drawer header */}
            <div className="flex h-14 items-center justify-between border-b px-4">
              <div className="flex items-center gap-3">
                <Image
                  src="/logo.png"
                  alt="KHAT"
                  width={28}
                  height={28}
                  className="rounded"
                />
                <span className="text-base font-semibold">لوحة التحكم</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={closeMobileDrawer}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            {/* Drawer nav */}
            <div className="h-[calc(100vh-3.5rem)] overflow-y-auto">
              <AdminSidebar collapsed={false} onNavClick={closeMobileDrawer} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

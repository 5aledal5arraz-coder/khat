"use client"

import Link from "next/link"
import { KhatLogo } from "@/components/brand/khat-logo"
import { useState, useEffect, useCallback, useRef } from "react"
import { usePathname } from "next/navigation"
import {
  ArrowLeft,
  PanelRightClose,
  PanelRight,
  Menu,
  X,
  LogOut,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"
import { AdminSidebar } from "./components/admin-sidebar"
import { ADMIN_LIGHT_TOKENS } from "./components/light-theme"
import { Breadcrumbs } from "./components/breadcrumbs"
import { AiDegradedBanner } from "./components/ai-degraded-banner"
import { BreadcrumbLabelProvider } from "@/lib/admin/breadcrumb-context"
import type { AiDegradedState } from "@/lib/ops/ai-degraded"

const ROLE_LABELS: Record<string, string> = {
  OWNER: "مالك",
  ADMIN: "مدير",
  EDITOR: "محرّر",
  VIEWER: "مشاهد",
}

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
  /** The drawer panel — the focus trap's boundary. */
  const drawerRef = useRef<HTMLDivElement>(null)
  /** The control that opened the drawer; focus goes back here on close. */
  const hamburgerRef = useRef<HTMLButtonElement>(null)

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
    // Restore focus to the opener BEFORE the state flip unmounts the panel.
    // Done here rather than in the effect's cleanup for two reasons: the
    // cleanup also runs on unmount/route change, where stealing focus is
    // wrong; and reading a ref in a cleanup is the exact pattern
    // `react-hooks/exhaustive-deps` warns about, because the node it points at
    // may already have been replaced. Synchronous focus here lands on a
    // button that is still mounted and still the one the user pressed.
    hamburgerRef.current?.focus()
    setMobileDrawerOpen(false)
  }, [])

  /**
   * Modal-dialog behaviour for the mobile drawer.
   *
   * Below `lg` this drawer is the ONLY navigation in the entire admin, and it
   * shipped as a plain `<div>`: no dialog role, no Escape, no focus
   * management. A keyboard or screen-reader user could open it and then tab
   * straight past it into the page behind — which is still rendered and still
   * focusable — with no way to close it and no announcement that anything had
   * opened. That is not a rough edge on mobile navigation; it is no mobile
   * navigation at all for those users.
   *
   * Three behaviours, all conditional on the drawer being open so nothing is
   * bound while it is closed:
   *   • Escape closes it (the expected exit from any modal).
   *   • Tab is cycled inside the panel — `preventDefault` + explicit focus on
   *     the first/last tabbable, so the wrap happens in both directions.
   *   • Focus moves INTO the panel on open. Moving it back out lives in
   *     `closeMobileDrawer`, not in this cleanup — see the note there.
   *
   * Written by hand rather than pulling in a focus-trap dependency: this is
   * one panel with a static, shallow DOM, and a new runtime dependency for it
   * needs approval this task does not have.
   */
  useEffect(() => {
    if (!mobileDrawerOpen) return
    const panel = drawerRef.current
    if (!panel) return

    const TABBABLE =
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
    const tabbables = () =>
      Array.from(panel.querySelectorAll<HTMLElement>(TABBABLE)).filter(
        // `offsetParent === null` catches `display:none` ancestors — the
        // collapsed nav groups render nothing, but be defensive about it.
        (el) => el.offsetParent !== null || el === document.activeElement,
      )

    // Move focus in. The close button is the safest landing spot: it is first
    // in the panel and it is the escape hatch.
    tabbables()[0]?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        closeMobileDrawer()
        return
      }
      if (e.key !== "Tab") return
      const items = tabbables()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [mobileDrawerOpen, closeMobileDrawer])

  return (
    <BreadcrumbLabelProvider>
    <div style={ADMIN_LIGHT_TOKENS} className="min-h-screen bg-background text-foreground">
      {/*
        `.skip-link` has been defined in globals.css since the beginning and was
        rendered by NOTHING — a styled class with no element is not an
        accessibility feature, it is dead CSS that reads like one in review.
        Given the choice the brief offered (use it or delete it): the admin is
        where it actually earns its keep. Every page here sits behind a sticky
        header plus a nav rail of up to 20 links, so a keyboard user pays that
        toll on every single navigation. First tab stop in the DOM, visually
        hidden until focused (the class handles that), targeting the `<main>`
        landmark below.
      */}
      <a href="#admin-main" className="skip-link">
        تخطَّ إلى المحتوى
      </a>

      {/* Admin Header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        {/* Brand hairline */}
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-l from-primary/70 via-primary/25 to-transparent" />
        <div className="flex h-14 items-center justify-between px-4 lg:px-5">
          <div className="flex items-center gap-3">
            {/* Desktop: sidebar toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label={sidebarOpen ? "إخفاء القائمة الجانبية" : "إظهار القائمة الجانبية"}
              aria-expanded={sidebarOpen}
              className="hidden h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground lg:flex"
            >
              {/* Panel*Right*, not Panel*Left*: in RTL the rail this button
                  toggles is docked to the RIGHT, so the left-panel glyph drew
                  a sidebar on the side of the screen that has none. */}
              {sidebarOpen ? (
                <PanelRightClose className="h-[18px] w-[18px]" />
              ) : (
                <PanelRight className="h-[18px] w-[18px]" />
              )}
            </Button>

            {/* Mobile: hamburger.
                Icon-only, so it had NO accessible name at all — and below
                `lg` it is the ONLY navigation on the page, which made the
                whole admin unnavigable by screen reader. The size override
                is gone too: `size="icon"` is already 44px (button.tsx), and
                the old `h-9 w-9` shrank the sole mobile nav control to 36px,
                under the 44px touch-target floor. */}
            <Button
              ref={hamburgerRef}
              variant="ghost"
              size="icon"
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="فتح قائمة التنقّل"
              aria-expanded={mobileDrawerOpen}
              className="shrink-0 text-muted-foreground lg:hidden"
            >
              <Menu className="h-[18px] w-[18px]" />
            </Button>

            {/* Logo + Title */}
            <div className="flex items-center gap-2.5">
              <KhatLogo size={28} />
              <div className="flex items-center gap-2">
                <h1 className="text-[13px] font-semibold">لوحة التحكم</h1>
                {userRole && (
                  <span className="rounded-[5px] border border-border/70 bg-muted/60 px-1.5 py-[1px] text-[11px] font-bold text-muted-foreground hidden sm:inline-block">
                    {ROLE_LABELS[userRole] ?? userRole}
                  </span>
                )}
              </div>
            </div>

            {/* Breadcrumbs separator + breadcrumbs */}
            <div className="hidden items-center gap-2 lg:flex">
              <div className="h-4 w-px bg-border/60" />
              <Breadcrumbs />
            </div>
          </div>

          {/* Both controls hide their Arabic label below `sm`, so both need
              an explicit accessible name or they are two unlabelled icons at
              390px. Both also grow to the 44px touch floor on mobile only —
              the compact 32px desktop chrome is unchanged. */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              disabled={loggingOut}
              aria-label="تسجيل الخروج"
              className="h-11 min-w-[44px] gap-2 px-2.5 text-[13px] text-muted-foreground hover:text-destructive sm:h-8 sm:min-w-0"
              title="تسجيل الخروج"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">خروج</span>
            </Button>
            <div className="mx-1 h-4 w-px bg-border/40 hidden sm:block" />
            {/* Was <Link><Button/></Link> — an <a> wrapping a <button>. Nested
                interactive content is invalid HTML and leaves keyboard/AT
                behaviour undefined (which element takes focus, which one
                Enter activates, is it a link or a command?). `button.tsx`
                has no `asChild`, so the link carries the button's classes
                directly: ONE element, one role, one focus stop. */}
            <Link
              href="/"
              aria-label="فتح الموقع العام"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "h-11 min-w-[44px] gap-2 px-2.5 text-[13px] text-muted-foreground sm:h-8 sm:min-w-0",
              )}
            >
              <span className="hidden sm:inline">الموقع</span>
              {/* `ArrowLeft`: in RTL the icon sits at the inline-end of the
                  label and "onward" points LEFT. `ArrowRight` aimed back into
                  the word it followed — and every other "go there" link in
                  /admin/ops already uses ArrowLeft. */}
              <ArrowLeft className="h-3.5 w-3.5" />
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

        {/* Main content — seamless light workspace (palette is on the root). */}
        <main id="admin-main" className="min-w-0 flex-1 p-4 lg:p-6">
          {/* admin-fade-in, not admin-animate-in: this wrapper contains every admin
              page, and a lingering transform here would capture their `fixed`
              modal layers. Fade only — the 8px slide is not worth 21 broken modals. */}
          <div className="admin-fade-in mx-auto max-w-[1400px]">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Drawer Overlay */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop. `aria-hidden` + no tab stop: the click-to-close is a
              convenience for pointer users, and Escape is the keyboard path. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={closeMobileDrawer}
          />
          {/* Drawer panel.
              SIDE: was `end-0`, which in this RTL admin is the LEFT edge — so
              the drawer flew in from the opposite side of the screen to both
              its own hamburger and the desktop rail it stands in for.
              `start-0` is the right edge in RTL, matching them. The
              `slide-in-from-right` animation was already correct for a
              right-docked panel (transforms are physical, not logical), so it
              was the position that was wrong, not the motion.
              SEMANTICS: role/aria-modal/aria-label + the focus trap above turn
              it into a real dialog. */}
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="قائمة التنقّل"
            className="absolute inset-y-0 start-0 w-72 bg-background shadow-2xl animate-in slide-in-from-right duration-300"
          >
            {/* Drawer header */}
            <div className="flex h-14 items-center justify-between border-b border-border/40 px-4">
              <div className="flex items-center gap-2.5">
                <KhatLogo size={26} />
                <span className="text-[13px] font-semibold">لوحة التحكم</span>
              </div>
              {/* 32px before this — and it is the ONLY way to close the drawer
                  by pointer other than hitting the backdrop. Full 44px target;
                  this control is mobile-only, so there is no desktop variant. */}
              <Button
                variant="ghost"
                size="icon"
                onClick={closeMobileDrawer}
                aria-label="إغلاق قائمة التنقّل"
                className="h-11 w-11 text-muted-foreground"
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

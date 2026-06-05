"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  PlayCircle,
  Users,
  Inbox,
  Settings,
  BarChart3,
  FileText,
  Mic,
  Home,
  Mail,
  UserCog,
  Handshake,
  Sparkles,
  Rss,
  UserPlus,
  Compass,
  Brain,
  Telescope,
  Lightbulb,
  ChevronDown,
  Activity,
  Bookmark,
  Gauge,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface NavItem {
  href: string
  icon: React.ElementType
  label: string
  badge?: "ai" | "new"
  /**
   * UX-4 — legacy items hidden by default but kept reachable via direct
   * URL. Set NEXT_PUBLIC_KHAT_LEGACY_EPISODES_VISIBLE=true to surface
   * the legacy episode list again.
   */
  legacy?: boolean
}

interface NavGroup {
  title: string
  items: NavItem[]
  /** Phase B.3 — group renders collapsed-by-default; click expands. */
  collapsible?: boolean
}

/**
 * Phase B1 — pinned home + three groups. The pinned "الرئيسية" item
 * at the very top points at `/admin/ops` (the new admin home — see
 * `app/admin/page.tsx`). It's a single-item group with NO title divider
 * so it reads as a top-of-sidebar shortcut, distinct from the named
 * groups below.
 *
 * The three named groups below preserve the B.3 mental model:
 *   • Khat Brain        — episode-workflow center (planning + execution)
 *   • الموقع              — back-office (guests, submissions, partners,
 *                          team, settings)
 *   • أدوات متقدمة         — power-user surfaces (collapsed by default)
 *
 * Operations dashboard was removed from group "الموقع" to avoid
 * duplicating the pinned Home item. Group "الموقع" was renamed from
 * the older "الموقع والعمليات" because operations are no longer in it.
 *
 * Routes are unchanged. Deep links + URL bookmarks continue to resolve.
 */
const navGroups: NavGroup[] = [
  {
    // Pinned home — single item, rendered without a section header.
    title: "__home__",
    items: [
      { href: "/admin/ops", icon: Gauge, label: "الرئيسية", badge: "new" },
    ],
  },
  {
    title: "Khat Brain",
    items: [
      { href: "/admin/khat-brain", icon: Brain, label: "مركز القيادة", badge: "new" },
      { href: "/admin/khat-brain/seasons", icon: Compass, label: "المواسم", badge: "ai" },
      { href: "/admin/khat-brain/episodes", icon: PlayCircle, label: "الحلقات", badge: "new" },
      { href: "/admin/khat-brain/market/signals", icon: Activity, label: "إشارات السوق", badge: "ai" },
      { href: "/admin/khat-brain/market/sources", icon: Bookmark, label: "المصادر الموثوقة", badge: "ai" },
      { href: "/admin/discovery-v2", icon: Telescope, label: "اكتشاف الضيوف", badge: "ai" },
      { href: "/admin/analytics", icon: BarChart3, label: "الأداء والتعلّم" },
    ],
  },
  {
    // Renamed from "الموقع والعمليات" since operations moved to the
    // pinned Home item above.
    title: "الموقع",
    items: [
      { href: "/admin/guests", icon: Users, label: "الضيوف" },
      { href: "/admin/home-content", icon: Home, label: "الصفحة الرئيسية" },
      { href: "/admin/newsletter", icon: Mail, label: "النشرة البريدية" },
      { href: "/admin/submissions", icon: Inbox, label: "الطلبات" },
      { href: "/admin/partnerships", icon: Handshake, label: "الشركاء" },
      { href: "/admin/media-kit", icon: FileText, label: "ملف الشراكة" },
      { href: "/admin/rss-sync", icon: Rss, label: "مزامنة RSS" },
      { href: "/admin/team", icon: UserCog, label: "فريق خط" },
      { href: "/admin/settings", icon: Settings, label: "الإعدادات" },
    ],
  },
  {
    title: "أدوات متقدمة",
    collapsible: true,
    items: [
      { href: "/admin/preparation", icon: Sparkles, label: "الإعداد", badge: "ai" },
      { href: "/admin/studio", icon: Mic, label: "الاستديو", badge: "ai" },
      { href: "/admin/guest-candidates", icon: UserPlus, label: "المرشحون" },
      { href: "/admin/khat-brain/original-thinking", icon: Lightbulb, label: "التفكير الأصيل", badge: "ai" },
      // Phase B — legacy episodes list stays gated. Toggle
      // NEXT_PUBLIC_KHAT_LEGACY_EPISODES_VISIBLE=true to reveal.
      {
        href: "/admin/episodes",
        icon: PlayCircle,
        label: "الحلقات",
        legacy: true,
      },
    ],
  },
]

interface AdminSidebarProps {
  collapsed: boolean
  onNavClick?: () => void
  userRole?: string
}

/** Links only visible to OWNER */
const OWNER_ONLY_HREFS = new Set(["/admin/team"])

function AdminSidebar({ collapsed, onNavClick, userRole }: AdminSidebarProps) {
  const pathname = usePathname()
  // UX-4 — flag-gated legacy items. The flag must be NEXT_PUBLIC_…
  // because the sidebar is a client component.
  const showLegacy =
    process.env.NEXT_PUBLIC_KHAT_LEGACY_EPISODES_VISIBLE === "true"

  // Phase B.3 — track which collapsible groups the operator has opened.
  // Default: closed. Auto-open when an item inside the group is the
  // current pathname (so operators don't need to expand to see where
  // they are).
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const isCollapsibleOpen = (group: NavGroup) => {
    if (!group.collapsible) return true
    if (openGroups[group.title] !== undefined) return openGroups[group.title]
    return group.items.some(
      (i) =>
        pathname === i.href ||
        (i.href !== "/admin" && pathname.startsWith(i.href)),
    )
  }

  return (
    <nav className="flex flex-col gap-0.5 p-2.5">
      {navGroups.map((group, groupIndex) => {
        const visibleItems = group.items.filter(
          (item) =>
            (!OWNER_ONLY_HREFS.has(item.href) || userRole === "OWNER") &&
            (!item.legacy || showLegacy),
        )
        if (visibleItems.length === 0) return null

        const open = isCollapsibleOpen(group)

        return (
        <div key={group.title}>
          {groupIndex > 0 && (
            <div className="my-2.5">
              {collapsed ? (
                <div className="mx-auto h-px w-5 bg-border/30" />
              ) : group.collapsible ? (
                <button
                  type="button"
                  onClick={() =>
                    setOpenGroups((prev) => ({
                      ...prev,
                      [group.title]: !open,
                    }))
                  }
                  className="group flex w-full items-center gap-1 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground/40 hover:text-muted-foreground/70"
                  data-collapsible-group={group.title}
                  data-collapsible-open={open}
                  aria-expanded={open}
                >
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 transition-transform",
                      open ? "rotate-0" : "-rotate-90",
                    )}
                  />
                  <span>{group.title}</span>
                </button>
              ) : (
                <div className="px-3 py-1">
                  <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground/40">
                    {group.title}
                  </span>
                </div>
              )}
            </div>
          )}
          {(group.collapsible && !open && !collapsed) ? null : visibleItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/admin" && pathname.startsWith(item.href))

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavClick}
                data-active={isActive}
                className={cn(
                  "admin-nav-item group/nav flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-all",
                  isActive
                    ? "bg-primary/8 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
                title={collapsed ? item.label : undefined}
              >
                <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors">
                  <item.icon className={cn(
                    "h-[18px] w-[18px] transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground/70 group-hover/nav:text-foreground"
                  )} />
                  {item.badge === "ai" && (
                    <span className="absolute -top-0.5 -end-0.5 flex h-2.5 w-2.5 items-center justify-center">
                      <Sparkles className="h-2.5 w-2.5 text-amber-500" />
                    </span>
                  )}
                </span>
                {!collapsed && (
                  <span className="flex-1 transition-opacity duration-200">
                    {item.label}
                  </span>
                )}
                {!collapsed && item.badge === "ai" && (
                  <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-500">
                    ذكي
                  </span>
                )}
                {/* Tooltip for collapsed state */}
                {collapsed && (
                  <div className="pointer-events-none absolute start-full top-1/2 z-50 ms-2 -translate-y-1/2 rounded-lg bg-popover px-3 py-1.5 text-xs font-medium text-popover-foreground shadow-lg border border-border/50 opacity-0 transition-all group-hover/nav:pointer-events-auto group-hover/nav:opacity-100">
                    {item.label}
                  </div>
                )}
              </Link>
            )
          })}
        </div>
        )
      })}

      {/* AI Assistant Hint */}
      {!collapsed && (
        <div className="mt-6 rounded-xl border border-primary/15 bg-primary/5 p-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-primary/70" />
            <span className="text-[11px] font-medium text-primary/80">مدعوم بالذكاء الاصطناعي</span>
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground/60">
            الاستوديو يعمل بتقنيات الذكاء الاصطناعي
          </p>
        </div>
      )}
    </nav>
  )
}

export { AdminSidebar, navGroups }

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
  KanbanSquare,
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
  /** Group renders collapsed-by-default; click expands. */
  collapsible?: boolean
}

/**
 * Pinned home + three groups:
 *   • Khat Brain   — the production pipeline: command center, seasons,
 *                    episodes, market intel, and the guest funnel
 *                    (discovery → المرشحون sit together because v2
 *                    promotion feeds candidates directly).
 *   • الموقع        — back-office (guests, content, newsletter, partners,
 *                    team, settings)
 *   • أدوات متقدمة   — power-user surfaces (collapsed by default)
 *
 * Routes are unchanged. Deep links + URL bookmarks continue to resolve.
 */
const navGroups: NavGroup[] = [
  {
    // Pinned home — single item, rendered without a section header.
    title: "__home__",
    items: [{ href: "/admin/ops", icon: Gauge, label: "الرئيسية" }],
  },
  {
    title: "Khat Brain",
    items: [
      { href: "/admin/khat-brain", icon: Brain, label: "مركز القيادة" },
      { href: "/admin/khat-brain/seasons", icon: Compass, label: "المواسم", badge: "ai" },
      { href: "/admin/khat-brain/episodes", icon: PlayCircle, label: "الحلقات" },
      { href: "/admin/discovery-v2", icon: Telescope, label: "اكتشاف الضيوف", badge: "ai" },
      { href: "/admin/guest-candidates", icon: UserPlus, label: "المرشحون" },
      { href: "/admin/khat-brain/market/signals", icon: Activity, label: "إشارات السوق", badge: "ai" },
      { href: "/admin/khat-brain/market/sources", icon: Bookmark, label: "المصادر الموثوقة" },
      { href: "/admin/analytics", icon: BarChart3, label: "الأداء والتعلّم" },
    ],
  },
  {
    title: "الموقع",
    items: [
      { href: "/admin/guests", icon: Users, label: "الضيوف" },
      { href: "/admin/home-content", icon: Home, label: "الصفحة الرئيسية" },
      { href: "/admin/newsletter", icon: Mail, label: "النشرة البريدية" },
      { href: "/admin/submissions", icon: Inbox, label: "الطلبات" },
      { href: "/admin/partnerships/pipeline", icon: KanbanSquare, label: "خط الشراكات", badge: "ai" },
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
      { href: "/admin/khat-brain/original-thinking", icon: Lightbulb, label: "التفكير الأصيل", badge: "ai" },
      // Legacy episodes list stays gated. Toggle
      // NEXT_PUBLIC_KHAT_LEGACY_EPISODES_VISIBLE=true to reveal.
      {
        href: "/admin/episodes",
        icon: PlayCircle,
        label: "الحلقات (القديمة)",
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

  // Track which collapsible groups the operator has opened.
  // Default: closed. Auto-open when an item inside the group is the
  // current pathname.
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

  // Longest-prefix active matching: only the most specific item lights
  // up (e.g. /admin/khat-brain/seasons doesn't also activate the
  // /admin/khat-brain command-center item).
  const allHrefs = navGroups.flatMap((g) => g.items.map((i) => i.href))
  const activeHref = allHrefs
    .filter((h) => pathname === h || pathname.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0]

  return (
    <nav className="flex h-full flex-col gap-0.5 p-2.5">
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
              <div className="my-2">
                {collapsed ? (
                  <div className="mx-auto h-px w-5 bg-border/40" />
                ) : group.collapsible ? (
                  <button
                    type="button"
                    onClick={() =>
                      setOpenGroups((prev) => ({
                        ...prev,
                        [group.title]: !open,
                      }))
                    }
                    className="group flex w-full items-center gap-1 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-muted-foreground"
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
                  <div className="px-3 pb-1 pt-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {group.title}
                    </span>
                  </div>
                )}
              </div>
            )}
            {group.collapsible && !open && !collapsed
              ? null
              : visibleItems.map((item) => {
                  const isActive = item.href === activeHref

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavClick}
                      data-active={isActive}
                      className={cn(
                        "admin-nav-item group/nav flex items-center gap-2.5 rounded-xl px-2 py-[7px] text-[12.5px] transition-all",
                        isActive
                          ? "bg-primary/10 font-semibold text-foreground"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                      title={collapsed ? item.label : undefined}
                    >
                      <span
                        className={cn(
                          "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
                          isActive && "bg-primary/15",
                        )}
                      >
                        <item.icon
                          className={cn(
                            "h-4 w-4 transition-colors",
                            isActive
                              ? "text-primary"
                              : "text-muted-foreground group-hover/nav:text-foreground",
                          )}
                        />
                      </span>
                      {!collapsed && (
                        <span className="flex-1 truncate transition-opacity duration-200">
                          {item.label}
                        </span>
                      )}
                      {!collapsed && item.badge === "ai" && (
                        <span className="inline-flex items-center gap-0.5 rounded-md bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary">
                          <Sparkles className="h-2.5 w-2.5" />
                          ذكي
                        </span>
                      )}
                      {/* Tooltip for collapsed state */}
                      {collapsed && (
                        <div className="pointer-events-none absolute start-full top-1/2 z-50 ms-2 -translate-y-1/2 rounded-lg border border-border/50 bg-popover px-3 py-1.5 text-xs font-medium text-popover-foreground opacity-0 shadow-lg transition-all group-hover/nav:pointer-events-auto group-hover/nav:opacity-100">
                          {item.label}
                        </div>
                      )}
                    </Link>
                  )
                })}
          </div>
        )
      })}

      {/* Footer brand note */}
      {!collapsed && (
        <div className="mt-auto pt-6">
          <div className="rounded-xl border border-primary/15 bg-gradient-to-br from-primary/8 to-accent/5 p-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-[11px] font-semibold text-foreground/85">
                خط بودكاست
              </span>
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/80">
              منظومة تشغيل مدعومة بالذكاء الاصطناعي
            </p>
          </div>
        </div>
      )}
    </nav>
  )
}

export { AdminSidebar, navGroups }

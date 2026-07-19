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
  Telescope,
  Lightbulb,
  ChevronDown,
  Activity,
  Gauge,
  KanbanSquare,
  Clapperboard,
  MessagesSquare,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface NavItem {
  href: string
  icon: React.ElementType
  label: string
}

interface NavGroup {
  title: string
  items: NavItem[]
  /** Group renders collapsed-by-default; click expands. */
  collapsible?: boolean
}

/**
 * Phase-2 IA (Sara's approved proposal): pinned home + five function groups,
 * each answering one operator question, with a single collapsed "النظام" group.
 *   • الرئيسية        — the operations home (command center merged in).
 *   • الإنتاج          — the production pipeline (seasons → episodes →
 *                        preparation → studio) + idea sources (market intel,
 *                        original thinking). الإعداد/الاستوديو promoted here.
 *   • الضيوف           — the guest funnel in flow order (discovery → candidates
 *                        → casting requests → guests).
 *   • الموقع والجمهور   — public-facing surfaces (episodes catalog, site
 *                        front, newsletter, community, analytics).
 *   • الشراكات         — partnerships pipeline, partners, media kit.
 *   • النظام (collapsed) — RSS sync, team (OWNER), settings.
 *
 * Routes are unchanged. Deep links + URL bookmarks continue to resolve.
 * "مركز القيادة" (/admin/khat-brain) is dropped from the rail — it merges into
 * the home; the route keeps resolving until the Phase-2.2 redirect lands.
 * "الطلبات" (/admin/submissions) is retained here temporarily until the
 * Phase-2.5 equivalence gate is approved, then removed from the rail.
 */
const navGroups: NavGroup[] = [
  {
    // Pinned home — single item, rendered without a section header.
    title: "__home__",
    items: [{ href: "/admin/ops", icon: Gauge, label: "الرئيسية" }],
  },
  {
    title: "الإنتاج",
    items: [
      { href: "/admin/khat-brain/seasons", icon: Compass, label: "المواسم" },
      { href: "/admin/khat-brain/episodes", icon: PlayCircle, label: "خط الإنتاج" },
      { href: "/admin/preparation", icon: Sparkles, label: "الإعداد" },
      { href: "/admin/studio", icon: Mic, label: "الاستوديو" },
      { href: "/admin/khat-brain/market/signals", icon: Activity, label: "إشارات السوق" },
      { href: "/admin/khat-brain/original-thinking", icon: Lightbulb, label: "التفكير الأصيل" },
    ],
  },
  {
    title: "الضيوف",
    items: [
      { href: "/admin/discovery-v2", icon: Telescope, label: "اكتشاف الضيوف" },
      { href: "/admin/guest-candidates", icon: UserPlus, label: "المرشحون" },
      { href: "/admin/casting", icon: Clapperboard, label: "طلبات الاستضافة" },
      { href: "/admin/guests", icon: Users, label: "الضيوف" },
    ],
  },
  {
    title: "الموقع والجمهور",
    items: [
      { href: "/admin/episodes", icon: PlayCircle, label: "الحلقات" },
      { href: "/admin/home-content", icon: Home, label: "واجهة الموقع" },
      { href: "/admin/newsletter", icon: Mail, label: "النشرة البريدية" },
      { href: "/admin/community", icon: MessagesSquare, label: "مساهمات المجتمع" },
      { href: "/admin/analytics", icon: BarChart3, label: "التحليلات" },
      // Retained until the Phase-2.5 equivalence gate is approved:
      { href: "/admin/submissions", icon: Inbox, label: "الطلبات" },
    ],
  },
  {
    title: "الشراكات",
    items: [
      { href: "/admin/partnerships/pipeline", icon: KanbanSquare, label: "خط الشراكات" },
      { href: "/admin/partnerships", icon: Handshake, label: "الشركاء" },
      { href: "/admin/media-kit", icon: FileText, label: "ملف الشراكة" },
    ],
  },
  {
    title: "النظام",
    collapsible: true,
    items: [
      { href: "/admin/rss-sync", icon: Rss, label: "مزامنة RSS" },
      { href: "/admin/team", icon: UserCog, label: "فريق خط" },
      { href: "/admin/settings", icon: Settings, label: "الإعدادات" },
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
          (item) => !OWNER_ONLY_HREFS.has(item.href) || userRole === "OWNER",
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

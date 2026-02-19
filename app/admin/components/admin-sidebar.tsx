"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Megaphone,
  PlayCircle,
  Users,
  Inbox,
  Settings,
  Shield,
  BarChart3,
  FileText,
  Mic,
  Home,
  Tag,
  FileEdit,
  Mail,
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
}

const navGroups: NavGroup[] = [
  {
    title: "الأساسية",
    items: [
      { href: "/admin", icon: LayoutDashboard, label: "الرئيسية" },
      { href: "/admin/episodes", icon: PlayCircle, label: "الحلقات" },
      { href: "/admin/studio", icon: Mic, label: "الاستوديو" },
    ],
  },
  {
    title: "المحتوى",
    items: [
      { href: "/admin/home-content", icon: Home, label: "الصفحة الرئيسية" },
      { href: "/admin/guests", icon: Users, label: "الضيوف" },
      { href: "/admin/topics", icon: Tag, label: "المواضيع" },
      { href: "/admin/content", icon: FileEdit, label: "المحتوى" },
    ],
  },
  {
    title: "التواصل",
    items: [
      { href: "/admin/submissions", icon: Inbox, label: "الطلبات" },
      { href: "/admin/moderation", icon: Shield, label: "الإشراف" },
      { href: "/admin/ads", icon: Megaphone, label: "الإعلانات" },
      { href: "/admin/newsletter", icon: Mail, label: "النشرة البريدية" },
    ],
  },
  {
    title: "النظام",
    items: [
      { href: "/admin/analytics", icon: BarChart3, label: "الإحصائيات" },
      { href: "/admin/media-kit", icon: FileText, label: "ملف الشراكة" },
      { href: "/admin/settings", icon: Settings, label: "الإعدادات" },
    ],
  },
]

interface AdminSidebarProps {
  collapsed: boolean
  onNavClick?: () => void
}

export function AdminSidebar({ collapsed, onNavClick }: AdminSidebarProps) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-1 p-3">
      {navGroups.map((group, groupIndex) => (
        <div key={group.title}>
          {groupIndex > 0 && (
            <div className="my-2">
              {collapsed ? (
                <div className="mx-auto h-px w-6 bg-border/50" />
              ) : (
                <div className="px-3 py-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                    {group.title}
                  </span>
                </div>
              )}
            </div>
          )}
          {group.items.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/admin" && pathname.startsWith(item.href))

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavClick}
                className={cn(
                  "group/nav relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all",
                  isActive
                    ? "border-e-2 border-primary bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground hover:translate-x-0.5"
                )}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {!collapsed && (
                  <span className="transition-opacity duration-200">
                    {item.label}
                  </span>
                )}
                {/* Tooltip for collapsed state */}
                {collapsed && (
                  <div className="pointer-events-none absolute start-full top-1/2 z-50 ms-2 -translate-y-1/2 rounded-lg bg-popover px-3 py-1.5 text-xs font-medium text-popover-foreground shadow-md opacity-0 transition-opacity group-hover/nav:pointer-events-auto group-hover/nav:opacity-100">
                    {item.label}
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

export { navGroups }

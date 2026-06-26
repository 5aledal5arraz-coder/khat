"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Activity, Bookmark } from "lucide-react"

/**
 * Shared sub-nav for the market intelligence surface. Signals and Trusted
 * Sources are two tabs of ONE radar — Sources is the config that tunes the
 * signal feed, so it lives here as a tab rather than a separate sidebar item.
 */
const TABS = [
  { href: "/admin/khat-brain/market/signals", label: "الإشارات", icon: Activity },
  { href: "/admin/khat-brain/market/sources", label: "المصادر الموثوقة", icon: Bookmark },
]

export function MarketSubnav() {
  const pathname = usePathname()
  return (
    <nav className="flex flex-wrap gap-1.5 rounded-2xl border border-border/40 bg-card/30 p-1.5" aria-label="الذكاء السوقي">
      {TABS.map((t) => {
        const active = pathname.startsWith(t.href)
        const Icon = t.icon
        return (
          <Link
            key={t.href}
            href={t.href}
            data-active={active}
            className={
              "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-[12px] font-medium transition-colors " +
              (active
                ? "border border-primary/30 bg-primary/10 text-primary"
                : "border border-transparent text-muted-foreground hover:border-border/40 hover:bg-background/60")
            }
          >
            <Icon className="h-3.5 w-3.5" />
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}

"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Headphones, Users, Handshake } from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/", icon: Home, label: "الرئيسية" },
  { href: "/episodes", icon: Headphones, label: "الحلقات" },
  { href: "/guests", icon: Users, label: "الضيوف" },
  { href: "/sponsor", icon: Handshake, label: "شراكة", highlight: true },
]

export function MobileNav({ hasNewEpisode = false }: { hasNewEpisode?: boolean }) {
  const pathname = usePathname()

  return (
    <nav
      aria-label="القائمة الرئيسية"
      className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 md:hidden"
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        transform: "translateZ(0)", // force GPU layer — prevents iOS losing position
      }}
    >
      <div className="flex items-center justify-around">
        {navItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href))

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-xs transition-colors",
                item.highlight
                  ? "text-primary font-medium"
                  : isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="relative">
                <item.icon className={cn("h-5 w-5", (isActive || item.highlight) && "text-primary")} />
                {hasNewEpisode && item.href === "/episodes" && (
                  <span className="absolute -top-0.5 -end-1 h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                )}
              </span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

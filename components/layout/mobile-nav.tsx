"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Headphones, PenSquare, Compass, MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"

const baseNavItems = [
  { href: "/", icon: Home, label: "الرئيسية" },
  { href: "/episodes", icon: Headphones, label: "الحلقات" },
  { href: "/space", icon: PenSquare, label: "حبر", requiresHibr: true },
  { href: "/about", icon: Compass, label: "عنّا" },
  { href: "/more", icon: MoreHorizontal, label: "المزيد" },
]

export function MobileNav({ hibrEnabled = true }: { hibrEnabled?: boolean }) {
  const navItems = baseNavItems.filter((item) => !item.requiresHibr || hibrEnabled)
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
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon className={cn("h-5 w-5", isActive && "text-primary")} />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

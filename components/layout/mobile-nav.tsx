"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home } from "lucide-react"
import { KhatIcon, type KhatIconName } from "@/components/brand/khat-icon"
import { cn } from "@/lib/utils"

// Four equal items. "ساهم معنا" replaced "شراكة" here because contribute is an
// audience action (and the header nav that carried it is hidden below md with no
// hamburger, so the phone had no path to it). Partnership keeps its own primary
// button in the sticky header plus a footer link, so it is not lost.
// No `highlight`: it renders in the same primary colour as the active item, so a
// permanently-highlighted tab makes "you are here" unreadable.
//
// THREE OF THE FOUR ARE THE IDENTITY'S OWN DRAWINGS, and they are drawn in the
// `mono` tone on purpose: this bar dims whatever tab you are not on, and the
// two-ink glyph keeps a full-strength orange accent no matter what colour it
// inherits, which would make every tab look active at once.
//
// "الرئيسية" stays on lucide's `Home`. The identity file ships six glyphs and a
// house is not among them, so the choice is a borrowed house or an invented one,
// and inventing a seventh glyph in someone else's drawing style is the worse of
// the two. The seam is real and visible; it is also honest.
type NavItem = { href: string; label: string } & (
  | { khat: KhatIconName; icon?: never }
  | { icon: typeof Home; khat?: never }
)

const navItems: NavItem[] = [
  { href: "/", icon: Home, label: "الرئيسية" },
  { href: "/episodes", khat: "archive", label: "الحلقات" },
  { href: "/guests", khat: "guest", label: "الضيوف" },
  { href: "/contribute", khat: "conversation", label: "ساهم معنا" },
]

export function MobileNav({ hasNewEpisode = false }: { hasNewEpisode?: boolean }) {
  const pathname = usePathname()

  return (
    <nav
      aria-label="القائمة الرئيسية"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 md:hidden"
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
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-micro transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="relative">
                {item.khat ? (
                  <KhatIcon
                    name={item.khat}
                    size={20}
                    className={cn(isActive && "text-primary")}
                  />
                ) : (
                  <item.icon className={cn("h-5 w-5", isActive && "text-primary")} />
                )}
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

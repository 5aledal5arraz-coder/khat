"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Search, X } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { KhatLogoSwap } from "@/components/brand/khat-logo"

/**
 * The header's logo swap, exported so the reflow guard can measure what this
 * component actually renders.
 *
 * It used to be spelled inline here and hand-copied into
 * tests/brand/logo-swap.test.ts under the comment "Exactly what header.tsx
 * renders" — a promise nothing enforced. Changing the real breakpoint left all
 * 67 tests green, because the test was measuring its own copy. One object, one
 * place.
 *
 * The 44: it sits in a 64px bar (lg:), leaving 10px above and below. It was 40 —
 * exactly MIN_HEIGHT for this lockup, i.e. on the floor with zero headroom,
 * where any later nudge downward gets silently clamped instead of showing up as
 * a visual change.
 */
/*
 * THE NAME COMES BACK TO THE HEADER, 2026-08-05.
 *
 * This swapped to the bare mark below 1024px, on the reasoning that the hero
 * badge spells «بودكاست خط» at those widths so the header need not. Khaled sent
 * a screenshot from his phone and the reasoning does not survive it: on a 402px
 * viewport the mark is 45px wide sitting hard against the right edge, and the
 * run between it and the search icon measures 217px of nothing. Over half the
 * header was empty in order to avoid a repetition there was room for.
 *
 * The lockup is 4.2:1, so at MIN_HEIGHT (40px — the artwork's floor, not a
 * preference) it needs 167px. Measured against that 217px gap it fits with
 * 50px to spare at 402, and still fits at 375. Below 380 the gap closes and
 * the mark takes over again — that is what the breakpoint is for.
 *
 * ONE SIZE ABOVE THE BREAKPOINT, NOT TWO. The lg:44px step is gone: the swap
 * declares exactly two candidates, and the guard in tests/brand/logo-swap.test.ts
 * checks that the heights spelled in the class are the heights spelled in the
 * props. A third CSS height reserved a box no candidate claimed — which is the
 * layout-shift bug that guard exists to catch.
 */
export const HEADER_LOGO = {
  compact: { variant: "mark", height: 32 },
  full: { variant: "lockup-horizontal", height: 40 },
  breakpoint: "380px",
  heightClassName: "h-[32px] min-[380px]:h-[40px]",
  label: null,
} as const

const navigation = [
  { name: "الحلقات", href: "/episodes" },
  { name: "الضيوف", href: "/guests" },
  { name: "ساهم معنا", href: "/contribute" },
  { name: "من نحن", href: "/about" },
]

export function Header({ hasNewEpisode = false }: { hasNewEpisode?: boolean }) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const router = useRouter()

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      router.push(`/episodes?search=${encodeURIComponent(searchQuery.trim())}`)
      setSearchOpen(false)
      setSearchQuery("")
    }
  }

  return (
    <header
      className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <nav className="container mx-auto flex h-14 items-center justify-between px-4 sm:h-16">
        {/* Logo */}
        {/* Two variants, not one scaled asset: the identity file pairs the
            horizontal lockup with wide placements and the mark alone with
            narrow ones, because `PODCAST KHAT` is unreadable once the lockup is
            squeezed below ~40px tall. The `خط` text that used to sit next to
            the old badge is gone — the lockup already carries the name, and at
            <lg the mark stands alone by design.

            This was two <KhatLogo> elements toggled with lg:hidden /
            hidden lg:block, which put BOTH inline in every page — including
            ~14 KB of lockup geometry on phones that never render it. <picture>
            with a media source makes the browser fetch exactly one. */}
        <Link
          href="/"
          aria-label="خط — الرئيسية"
          className="flex shrink-0 items-center transition-opacity hover:opacity-90"
        >
          <KhatLogoSwap {...HEADER_LOGO} />
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden items-center gap-6 md:flex">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="relative text-caption font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.name}
              {hasNewEpisode && item.href === "/episodes" && (
                <span className="absolute -top-1 -end-2 h-2 w-2 rounded-full bg-primary animate-pulse" />
              )}
            </Link>
          ))}
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-2">
          {searchOpen ? (
            <form onSubmit={handleSearch} className="flex items-center gap-2">
              <Input
                type="search"
                placeholder="ابحث..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-40 md:w-64"
                autoFocus
              />
              {/* Visible submit control — gives a clickable search target and
                  makes Enter reliably fire the form's onSubmit handler. */}
              <Button type="submit" variant="ghost" size="icon" aria-label="بحث">
                <Search className="h-5 w-5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="إغلاق البحث"
                onClick={() => {
                  setSearchOpen(false)
                  setSearchQuery("")
                }}
              >
                <X className="h-5 w-5" />
              </Button>
            </form>
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSearchOpen(true)}
              >
                <Search className="h-5 w-5" />
                <span className="sr-only">بحث</span>
              </Button>
              <Link
                href="/partner"
                className={buttonVariants({ variant: "default", size: "sm" })}
              >
                كن شريكاً
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  )
}

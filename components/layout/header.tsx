"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Search, X } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { KhatLogo } from "@/components/brand/khat-logo"

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
            <lg the mark stands alone by design. */}
        <Link
          href="/"
          aria-label="خط — الرئيسية"
          className="flex shrink-0 items-center transition-opacity hover:opacity-90"
        >
          <KhatLogo variant="mark" height={32} label={null} className="lg:hidden" />
          <KhatLogo
            variant="lockup-horizontal"
            // 40, not the 36–40 band's midpoint: 40px IS the identity file's
            // floor for this lockup, so the band has exactly one legal value.
            // Asking for 38 got clamped here and warned — the guard works.
            height={40}
            label={null}
            className="hidden lg:block"
          />
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

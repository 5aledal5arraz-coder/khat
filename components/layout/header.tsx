"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const navigation = [
  { name: "الحلقات", href: "/episodes" },
  { name: "الضيوف", href: "/guests" },
  { name: "المجموعات", href: "/series" },
  { name: "المساحة", href: "/space" },
  { name: "الموارد", href: "/resources" },
]

export function Header() {
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
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <nav className="container mx-auto flex h-14 items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl font-bold text-primary">خط</span>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden items-center gap-6 md:flex">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.name}
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
              <Button
                type="button"
                variant="ghost"
                size="icon"
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
              <Link href="/sponsor" className="hidden md:block">
                <Button variant="default" size="sm">
                  كن راعياً
                </Button>
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  )
}

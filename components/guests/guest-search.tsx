"use client"

import { useRef, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"

export function GuestSearch() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSearch = useCallback((value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set("search", value)
    } else {
      params.delete("search")
    }
    router.push(`/guests?${params.toString()}`)
  }, [router, searchParams])

  return (
    <div className="relative max-w-md">
      <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="ابحث عن ضيف..."
        className="ps-10"
        defaultValue={searchParams.get("search") || ""}
        onChange={(e) => {
          if (timerRef.current) clearTimeout(timerRef.current)
          const value = e.target.value
          timerRef.current = setTimeout(() => {
            handleSearch(value)
          }, 300)
        }}
      />
    </div>
  )
}

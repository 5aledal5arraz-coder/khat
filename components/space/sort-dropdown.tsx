"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

const sortOptions = [
  { id: "newest", label: "الأحدث" },
  { id: "popular", label: "الأكثر إعجاباً" },
  { id: "discussed", label: "الأكثر تفاعلاً" },
]

export function SortDropdown() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isOpen, setIsOpen] = useState(false)

  const currentSort = searchParams.get("sort") || "newest"
  const currentLabel = sortOptions.find((o) => o.id === currentSort)?.label || "الأحدث"

  const handleSort = (sortId: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (sortId === "newest") {
      params.delete("sort")
    } else {
      params.set("sort", sortId)
    }
    router.push(`/space?${params.toString()}`)
    setIsOpen(false)
  }

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="gap-2"
      >
        <span>{currentLabel}</span>
        <ChevronDown
          className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")}
        />
      </Button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute top-full z-50 mt-1 w-36 rounded-lg border bg-popover p-1 shadow-lg end-0">
            {sortOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => handleSort(option.id)}
                className={cn(
                  "w-full rounded-md px-3 py-2 text-start text-sm transition-colors",
                  currentSort === option.id
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

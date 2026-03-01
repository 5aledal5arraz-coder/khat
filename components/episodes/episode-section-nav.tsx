"use client"

import { useState, useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"

interface SectionDef {
  id: string
  label: string
}

interface EpisodeSectionNavProps {
  sections: SectionDef[]
}

export function EpisodeSectionNav({ sections }: EpisodeSectionNavProps) {
  const [activeId, setActiveId] = useState("")
  const [visible, setVisible] = useState(false)

  const updateActive = useCallback(() => {
    // Show nav after scrolling past 500px
    setVisible(window.scrollY > 500)

    // Find which section is currently in view
    let current = ""
    for (const sec of sections) {
      const el = document.getElementById(sec.id)
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (rect.top <= 120) {
        current = sec.id
      }
    }
    setActiveId(current)
  }, [sections])

  useEffect(() => {
    window.addEventListener("scroll", updateActive, { passive: true })
    return () => window.removeEventListener("scroll", updateActive)
  }, [updateActive])

  if (!visible || sections.length < 3) return null

  function scrollToSection(id: string) {
    const el = document.getElementById(id)
    if (el) {
      const offset = 80
      const top = el.getBoundingClientRect().top + window.scrollY - offset
      window.scrollTo({ top, behavior: "smooth" })
    }
  }

  return (
    <div className="fixed top-[56px] start-0 end-0 z-30 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="container mx-auto px-4">
        <div className="flex gap-1 overflow-x-auto py-2 scrollbar-hide">
          {sections.map((sec) => (
            <button
              key={sec.id}
              onClick={() => scrollToSection(sec.id)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-xs transition-colors",
                activeId === sec.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {sec.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

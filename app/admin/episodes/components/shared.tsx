"use client"

import { useState, useRef, useEffect } from "react"
import { MoreVertical } from "lucide-react"
import type {
  EpisodeOverride,
  EpisodeSectionsConfig,
  EpisodeQuotesConfig,
  YouTubePackConfig,
} from "@/types/ads"

/* ─── Types ─── */

export interface Episode {
  id: string
  title: string
  description: string
  youtube_url: string
  release_date: string
  duration_minutes: number
  guestId: string | null
  guestName: string | null
}

export interface AdminGuest {
  id: string
  name: string
  photo_url: string | null
}

export interface EpisodesPageData {
  episodes: Episode[]
  overrides: EpisodeOverride[]
  sectionsConfig: EpisodeSectionsConfig
  guestAssignments: Record<string, string>
  guests: AdminGuest[]
  quotesConfig: EpisodeQuotesConfig
  youtubePackConfig: YouTubePackConfig
}

/* ─── Formatters ─── */

export function formatDuration(minutes: number): string {
  if (!minutes) return ""
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0) return `${h}:${String(m).padStart(2, "0")} س`
  return `${m} د`
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

/* ─── Glow Card ─── */

export function GlowCard({
  children,
  color = "primary",
  className = "",
}: {
  children: React.ReactNode
  color?: "primary" | "purple" | "destructive" | "muted"
  className?: string
}) {
  const glowMap = {
    primary: "from-primary/20 via-transparent to-primary/5",
    purple: "from-accent/20 via-transparent to-accent/5",
    destructive: "from-destructive/20 via-transparent to-destructive/5",
    muted: "from-muted-foreground/10 via-transparent to-muted-foreground/5",
  }

  return (
    <div
      className={`group/card relative overflow-hidden rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm transition-all hover:border-border ${className}`}
    >
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${glowMap[color]} opacity-0 transition-opacity group-hover/card:opacity-100`}
      />
      <div className="relative">{children}</div>
    </div>
  )
}

/* ─── Action Menu (three-dot dropdown) ─── */

export function ActionMenu({
  children,
}: {
  children: (close: () => void) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setOpen(!open)
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="خيارات"
        className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition-all hover:bg-white/5 hover:text-foreground"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute end-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-2xl border border-border/50 bg-card/95 shadow-2xl shadow-black/20 backdrop-blur-xl"
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

/* ─── Menu Item ─── */

export function MenuItem({
  icon: Icon,
  label,
  onClick,
  disabled,
  variant,
}: {
  icon: React.ElementType
  label: string
  onClick: () => void
  disabled?: boolean
  variant?: "default" | "danger"
}) {
  return (
    <button
      role="menuitem"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      disabled={disabled}
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-all disabled:opacity-50 ${
        variant === "danger"
          ? "text-destructive hover:bg-destructive/10"
          : "text-foreground hover:bg-white/5"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-60" />
      {label}
    </button>
  )
}

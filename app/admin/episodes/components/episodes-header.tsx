"use client"

import { Sparkles, PlayCircle, Layers, EyeOff, Clock } from "lucide-react"
import { GlowCard } from "./shared"

interface EpisodesHeaderProps {
  totalEpisodes: number
  totalSections: number
  hiddenCount: number
  totalHours: number
}

export function EpisodesHeader({
  totalEpisodes,
  totalSections,
  hiddenCount,
  totalHours,
}: EpisodesHeaderProps) {
  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="relative overflow-hidden rounded-3xl border border-border/30 bg-gradient-to-bl from-primary/10 via-card/80 to-accent/5 p-8 backdrop-blur-sm">
        <div className="pointer-events-none absolute -end-20 -top-20 h-60 w-60 rounded-full bg-primary/5 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 -start-10 h-40 w-40 rounded-full bg-accent/5 blur-3xl" />
        <div className="relative">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-widest text-primary">
              لوحة التحكم
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">إدارة الحلقات</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            تنظيم وتعديل حلقات البودكاست
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <GlowCard color="primary">
          <div className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                <PlayCircle className="h-5 w-5 text-primary" />
              </div>
              <span className="text-3xl font-bold">{totalEpisodes}</span>
            </div>
            <p className="mt-3 text-xs font-medium text-muted-foreground">
              إجمالي الحلقات
            </p>
          </div>
        </GlowCard>

        <GlowCard color="purple">
          <div className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10">
                <Layers className="h-5 w-5 text-accent" />
              </div>
              <span className="text-3xl font-bold">{totalSections}</span>
            </div>
            <p className="mt-3 text-xs font-medium text-muted-foreground">
              التصنيفات
            </p>
          </div>
        </GlowCard>

        <GlowCard color="muted">
          <div className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted">
                <EyeOff className="h-5 w-5 text-muted-foreground" />
              </div>
              <span className="text-3xl font-bold">{hiddenCount}</span>
            </div>
            <p className="mt-3 text-xs font-medium text-muted-foreground">
              مخفي
            </p>
          </div>
        </GlowCard>

        <GlowCard color="primary">
          <div className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <span className="text-3xl font-bold">{totalHours}</span>
            </div>
            <p className="mt-3 text-xs font-medium text-muted-foreground">
              ساعة محتوى
            </p>
          </div>
        </GlowCard>
      </div>
    </div>
  )
}

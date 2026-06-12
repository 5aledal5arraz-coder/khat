/**
 * Admin UI kit — the shared visual vocabulary of the dashboard.
 *
 * Server-safe presentational primitives. Every admin surface should
 * compose these instead of re-implementing stat tiles, empty states,
 * section chrome, and skeletons per page. All colors come from the
 * KHAT token system (globals.css) so light/dark stay consistent.
 */

import type { ReactNode } from "react"
import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Tones ───────────────────────────────────────────────────────────

export type KitTone = "default" | "gold" | "purple" | "success" | "warning" | "danger"

const TONE_ICON: Record<KitTone, string> = {
  default: "bg-muted/70 text-muted-foreground",
  gold: "bg-primary/12 text-primary",
  purple: "bg-accent/12 text-accent dark:text-accent-foreground/90",
  success: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
  danger: "bg-destructive/12 text-destructive",
}

const TONE_VALUE: Record<KitTone, string> = {
  default: "text-foreground",
  gold: "text-foreground",
  purple: "text-foreground",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-destructive",
}

// ─── StatCard ────────────────────────────────────────────────────────

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  hint,
  href,
}: {
  label: string
  value: ReactNode
  icon: LucideIcon
  tone?: KitTone
  /** Small line under the value, e.g. "آخر ٢٤ ساعة". */
  hint?: string
  /** Makes the whole card a link. */
  href?: string
}) {
  const body = (
    <div
      className={cn(
        "group relative flex items-start gap-3 overflow-hidden rounded-2xl border border-border/60 bg-card p-4 transition-all",
        href && "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5",
      )}
    >
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", TONE_ICON[tone])}>
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <div className="min-w-0">
        <div className="text-[11.5px] font-medium text-muted-foreground">{label}</div>
        <div className={cn("mt-0.5 text-xl font-bold tabular-nums tracking-tight", TONE_VALUE[tone])}>
          {value}
        </div>
        {hint ? <div className="mt-0.5 text-[10.5px] text-muted-foreground/70">{hint}</div> : null}
      </div>
    </div>
  )
  return href ? <Link href={href}>{body}</Link> : body
}

// ─── KitCard — section chrome ────────────────────────────────────────

export function KitCard({
  title,
  subtitle,
  icon: Icon,
  tone = "default",
  action,
  className,
  children,
}: {
  title: string
  subtitle?: string
  icon?: LucideIcon
  tone?: KitTone
  /** Rendered at the far end of the header (link, button…). */
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section className={cn("rounded-2xl border border-border/60 bg-card p-5", className)}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {Icon ? (
            <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", TONE_ICON[tone])}>
              <Icon className="h-4 w-4" />
            </span>
          ) : null}
          <div>
            <h2 className="text-[13.5px] font-bold tracking-tight text-foreground">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p> : null}
          </div>
        </div>
        {action}
      </header>
      <div className="text-sm">{children}</div>
    </section>
  )
}

// ─── EmptyState ──────────────────────────────────────────────────────

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 text-center",
        compact ? "gap-2 p-6" : "gap-3 p-10",
      )}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted/70 text-muted-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-[13px] font-semibold text-foreground">{title}</div>
        {description ? (
          <p className="mx-auto mt-1 max-w-sm text-[11.5px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  )
}

// ─── Skeletons ───────────────────────────────────────────────────────

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-muted/60", className)} />
}

export function SkeletonStatRow({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonBlock key={i} className="h-[84px]" />
      ))}
    </div>
  )
}

// ─── QuickLink — action tile ─────────────────────────────────────────

export function QuickLink({
  href,
  icon: Icon,
  label,
  description,
  tone = "default",
}: {
  href: string
  icon: LucideIcon
  label: string
  description?: string
  tone?: KitTone
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-3.5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
    >
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors", TONE_ICON[tone])}>
        <Icon className="h-[17px] w-[17px]" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12.5px] font-semibold text-foreground">{label}</span>
        {description ? (
          <span className="block truncate text-[10.5px] text-muted-foreground">{description}</span>
        ) : null}
      </span>
    </Link>
  )
}

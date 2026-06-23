"use client"

/**
 * Shared presentational leaves for the phase-aware recording cockpit.
 *
 * These are the pieces reused across the three modes (pre-flight / on-air /
 * wrap) and the drawers — chips, the coaching banner, the Insight Cards stack,
 * guidance/option lists, a collapsible Drawer, and a compact energy control.
 * Kept free of server-action logic; handlers come in as props so the
 * orchestrator (live-v2-client) stays the single owner of state + actions.
 */

import { useState, type ReactNode } from "react"
import {
  Check,
  Copy,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Lightbulb,
  Zap,
  Info,
  BarChart3,
  FlaskConical,
  Calendar,
  BookOpen,
  Smile,
  ShieldCheck,
  Clock,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react"
import { SECTION_TARGET_LEVEL } from "@/lib/recording-v2/energy"
import type {
  SectionKind,
  PrepV2Insight,
  PrepV2InsightSource,
  InsightType,
  InsightTiming,
  InsightConfidence,
} from "@/lib/preparation/v2/types"

// ─── Question chips ───────────────────────────────────────────────────

export const TYPE_LABEL_AR: Record<string, string> = {
  emotional: "عاطفي",
  philosophical: "فلسفي",
  personal: "شخصي",
  confrontational: "مواجهة",
  reflective: "تأملي",
  factual: "سياقي",
}

export function PriorityChip({ priority }: { priority: "must_ask" | "if_time" }) {
  if (priority === "must_ask") {
    return (
      <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
        أساسي
      </span>
    )
  }
  return (
    <span className="rounded-full bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground">
      إن سمح الوقت
    </span>
  )
}

export function RiskChip({ risk }: { risk: "low" | "medium" | "high" }) {
  if (risk === "low") return null // low risk is the default — don't add noise
  const cls = risk === "high" ? "bg-rose-500/10 text-rose-700" : "bg-amber-500/10 text-amber-700"
  const label = risk === "high" ? "حسّاس" : "انتبه"
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] ${cls}`}>
      <AlertTriangle className="h-2.5 w-2.5" /> {label}
    </span>
  )
}

export function TypeChips({ types }: { types: string[] }) {
  return (
    <>
      {types.map((t) => (
        <span
          key={t}
          className="rounded-full border border-border/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
        >
          {TYPE_LABEL_AR[t] ?? t}
        </span>
      ))}
    </>
  )
}

// ─── Coaching whisper (energy ↔ section tension) ──────────────────────

export function CoachHintBanner({
  hint,
  energy,
  section,
}: {
  hint: string
  energy: number
  section: SectionKind | null
}) {
  const target = section ? SECTION_TARGET_LEVEL[section] : null
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2">
      <span className="inline-flex items-center gap-2 text-[12.5px] font-medium text-amber-700">
        <Zap className="h-3.5 w-3.5 shrink-0 text-amber-600" />
        {hint}
      </span>
      {target != null && (
        <span className="text-[10.5px] tabular-nums text-muted-foreground" dir="rtl">
          الطاقة {energy}/5 · المستهدف {target}/5
        </span>
      )}
    </div>
  )
}

// ─── Guidance / option lists (surface buried prep content) ────────────

export function GuidanceList({
  label,
  items,
  tone = "neutral",
  icon,
}: {
  label: string
  items: string[]
  tone?: "good" | "bad" | "warn" | "neutral"
  icon?: ReactNode
}) {
  if (!items || items.length === 0) return null
  const toneCls =
    tone === "good"
      ? "text-emerald-700"
      : tone === "bad"
        ? "text-rose-700"
        : tone === "warn"
          ? "text-amber-700"
          : "text-muted-foreground"
  return (
    <div>
      <div className={`mb-1 inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wider ${toneCls}`}>
        {icon}
        {label}
      </div>
      <ul className="space-y-0.5">
        {items.map((x, i) => (
          <li key={i} className="flex gap-1.5 text-[12.5px] leading-relaxed text-foreground/85">
            <span className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${toneCls.replace("text-", "bg-")}`} />
            {x}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** A pre-written option (opening/closing) with one-tap copy. */
export function OptionList({
  items,
}: {
  items: Array<{ approach: string; text: string }>
}) {
  const [copied, setCopied] = useState<number | null>(null)
  if (!items || items.length === 0) return null
  return (
    <ul className="space-y-2">
      {items.map((o, i) => (
        <li key={i} className="rounded-xl border border-border/40 bg-background/40 p-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
              {o.approach}
            </span>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(o.text)
                setCopied(i)
                window.setTimeout(() => setCopied((c) => (c === i ? null : c)), 1500)
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-border/50 px-2 py-0.5 text-[10.5px] text-muted-foreground transition hover:bg-background/70"
            >
              {copied === i ? (
                <>
                  <Check className="h-3 w-3 text-emerald-600" /> نُسخ
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" /> نسخ
                </>
              )}
            </button>
          </div>
          <div className="text-[13px] leading-relaxed text-foreground/90">{o.text}</div>
        </li>
      ))}
    </ul>
  )
}

// ─── Collapsible drawer (progressive disclosure) ──────────────────────

export function Drawer({
  title,
  icon,
  badge,
  defaultOpen = false,
  accent,
  children,
}: {
  title: string
  icon?: ReactNode
  badge?: ReactNode
  defaultOpen?: boolean
  /** Optional accent (e.g. "amber") for an attention pulse on the header. */
  accent?: "amber" | null
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border border-border/40 bg-background/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={
          "flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-[12.5px] font-medium transition hover:bg-background/60 " +
          (accent === "amber" ? "text-amber-700" : "text-foreground/85")
        }
      >
        <span className="inline-flex items-center gap-2">
          {icon}
          {title}
          {badge}
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && <div className="border-t border-border/30 p-3.5">{children}</div>}
    </div>
  )
}

// ─── Compact energy control (5 dots) ──────────────────────────────────

export function CompactEnergyControl({
  level,
  interactive,
  onSet,
}: {
  level: number
  interactive: boolean
  onSet: (level: number) => void
}) {
  const n = Math.max(0, Math.min(5, level))
  return (
    <span className="inline-flex items-center gap-1" title={`الطاقة ${n}/5`}>
      <Zap className="h-3.5 w-3.5 text-amber-600" />
      <span className="inline-flex gap-0.5">
        {Array.from({ length: 5 }).map((_, i) =>
          interactive ? (
            <button
              key={i}
              type="button"
              onClick={() => i + 1 !== level && onSet(i + 1)}
              aria-label={`ضبط الطاقة على ${i + 1}`}
              className={
                "h-2 w-2 rounded-full transition " +
                (i < n ? "bg-amber-500" : "bg-muted-foreground/25 hover:bg-amber-500/40")
              }
            />
          ) : (
            <span
              key={i}
              className={"h-2 w-2 rounded-full " + (i < n ? "bg-amber-500" : "bg-muted-foreground/25")}
            />
          ),
        )}
      </span>
    </span>
  )
}

// ─── Insight Cards stack ──────────────────────────────────────────────
//
// Collapse-by-default support cards under a question: a "💡 إسناد N" badge the
// host pulls open. Never auto-expands — split attention during a live take is
// the whole constraint. A correction is flagged in the collapsed badge so the
// host knows to watch even before opening.

export const INSIGHT_META: Record<InsightType, { label: string; Icon: LucideIcon; chip: string }> = {
  fact: { label: "معلومة", Icon: Info, chip: "bg-sky-500/10 text-sky-700" },
  stat: { label: "إحصائية", Icon: BarChart3, chip: "bg-sky-500/10 text-sky-700" },
  research: { label: "دراسة", Icon: FlaskConical, chip: "bg-violet-500/10 text-violet-700" },
  date: { label: "تاريخ", Icon: Calendar, chip: "bg-indigo-500/10 text-indigo-700" },
  reference: { label: "مرجع", Icon: BookOpen, chip: "bg-violet-500/10 text-violet-700" },
  correction: { label: "تصحيح", Icon: AlertTriangle, chip: "bg-amber-500/15 text-amber-700" },
  levity: { label: "طرافة", Icon: Smile, chip: "bg-orange-500/10 text-orange-700" },
}

const TIMING_LABEL_AR: Record<InsightTiming, string> = {
  before: "قبل",
  during: "أثناء",
  after: "بعد",
}

export function InsightStrip(props: {
  insights: PrepV2Insight[]
  used: Set<string>
  onUse: (insight: PrepV2Insight) => void
  markDisabled: boolean
  /** Start expanded (the on-air hero opens its cards; the bank stays collapsed). */
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(props.defaultOpen ?? false)
  const hasCorrection = props.insights.some((i) => i.type === "correction")
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/5 px-2.5 py-1 text-[11px] font-medium text-teal-700 transition hover:bg-teal-500/10"
      >
        <Lightbulb className="h-3 w-3" />
        إسناد {props.insights.length}
        {hasCorrection && (
          <span className="inline-flex items-center gap-0.5 text-amber-700">
            <AlertTriangle className="h-2.5 w-2.5" /> تصحيح
          </span>
        )}
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {props.insights.map((ins) => (
            <InsightCard
              key={ins.id}
              insight={ins}
              used={props.used.has(ins.id)}
              onUse={() => props.onUse(ins)}
              markDisabled={props.markDisabled}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function InsightCard(props: {
  insight: PrepV2Insight
  used: boolean
  onUse: () => void
  markDisabled: boolean
}) {
  const ins = props.insight
  const meta = INSIGHT_META[ins.type]
  const Icon = meta.Icon
  const isCorrection = ins.type === "correction" && !!ins.correction
  return (
    <div
      className={
        "rounded-xl border p-2.5 " +
        (isCorrection ? "border-amber-500/40 bg-amber-500/5" : "border-border/50 bg-background/50")
      }
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span className={"inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium " + meta.chip}>
          <Icon className="h-2.5 w-2.5" /> {meta.label}
        </span>
        <span className="inline-flex items-center gap-0.5 rounded-full border border-border/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          <Clock className="h-2.5 w-2.5" /> {TIMING_LABEL_AR[ins.timing]}
        </span>
        <span className="ms-auto">
          <ConfidenceChip confidence={ins.confidence} />
        </span>
      </div>

      {isCorrection && ins.correction ? (
        <div className="text-[13px] leading-relaxed">
          <div>
            <span className="text-amber-700">إن قال الضيف:</span> {ins.correction.inaccuracy}
          </div>
          <div className="mt-0.5">
            <span className="text-emerald-700">الصحيح:</span> {ins.correction.accurate}
          </div>
        </div>
      ) : (
        <div className="text-[13px] leading-relaxed text-foreground">{ins.text}</div>
      )}

      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1">
          {ins.sources.map((s, i) => (
            <SourceLink key={i} source={s} />
          ))}
        </div>
        <button
          type="button"
          onClick={props.onUse}
          disabled={props.markDisabled || props.used}
          title={props.used ? "تم وضع علامة الاستخدام" : "علِّم أنك استخدمت هذه البطاقة"}
          className={
            "inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition disabled:cursor-not-allowed " +
            (props.used
              ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 disabled:opacity-100"
              : "border-border/50 text-foreground/85 hover:bg-background/80 disabled:opacity-40")
          }
        >
          <Check className="h-3 w-3" /> {props.used ? "تم" : "استُخدم"}
        </button>
      </div>
    </div>
  )
}

function ConfidenceChip({ confidence }: { confidence: InsightConfidence }) {
  if (confidence === "verified") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
        <ShieldCheck className="h-2.5 w-2.5" /> موثوق
      </span>
    )
  }
  if (confidence === "partial") {
    return (
      <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
        جزئي
      </span>
    )
  }
  return (
    <span className="rounded-full bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">غير مؤكد</span>
  )
}

function SourceLink({ source }: { source: PrepV2InsightSource }) {
  const host = sourceHost(source)
  const year = sourceYear(source.published_at)
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noreferrer"
      title={source.title}
      className="inline-flex max-w-[200px] items-center gap-1 truncate text-[11px] text-sky-700 hover:underline"
    >
      <ExternalLink className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate">
        {source.publisher ?? host}
        {year ? ` · ${year}` : ""}
      </span>
    </a>
  )
}

function sourceHost(source: PrepV2InsightSource): string {
  try {
    return new URL(source.url).hostname.replace(/^www\./, "")
  } catch {
    return source.publisher ?? source.title
  }
}

function sourceYear(publishedAt?: string): string | null {
  if (!publishedAt) return null
  const m = publishedAt.match(/\b(19|20)\d{2}\b/)
  return m ? m[0] : null
}

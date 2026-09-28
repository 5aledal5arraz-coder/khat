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

import { useEffect, useState, type ReactNode, type RefObject } from "react"
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
  X,
  type LucideIcon,
} from "lucide-react"
import {
  ENERGY_BAND_LABEL_AR,
  sectionTargetLevel,
  energyBand,
} from "@/lib/recording-v2/energy"
import type { PrepFormat } from "@/lib/preparation/v2/format"
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
      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[12px] font-medium text-emerald-700">
        أساسي
      </span>
    )
  }
  return (
    <span className="rounded-full bg-muted/30 px-2 py-0.5 text-[12px] text-muted-foreground">
      إن سمح الوقت
    </span>
  )
}

export function RiskChip({ risk }: { risk: "low" | "medium" | "high" }) {
  if (risk === "low") return null // low risk is the default — don't add noise
  const cls = risk === "high" ? "bg-rose-500/10 text-rose-700" : "bg-amber-500/10 text-amber-700"
  const label = risk === "high" ? "حسّاس" : "انتبه"
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] ${cls}`}>
      <AlertTriangle className="h-3 w-3" /> {label}
    </span>
  )
}

export function TypeChips({ types }: { types: string[] }) {
  return (
    <>
      {types.map((t) => (
        <span
          key={t}
          className="rounded-full border border-border/40 px-2 py-0.5 text-[12px] text-muted-foreground"
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
  format = "story",
}: {
  hint: string
  energy: number
  section: SectionKind | null
  format?: PrepFormat
}) {
  const target = section ? sectionTargetLevel(section, format) : null
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

/**
 * A pre-written option (opening/closing) with one-tap copy.
 *
 * With `onChoose`, the host can also mark ONE option as his — the chosen
 * opening is what the on-air screen shows above the first question of the
 * first section, so the line he rehearsed is in front of him when the camera
 * rolls instead of one screen back.
 */
export function OptionList({
  items,
  chosenIndex,
  onChoose,
}: {
  items: Array<{ approach: string; text: string }>
  chosenIndex?: number | null
  onChoose?: (index: number) => void
}) {
  const [copied, setCopied] = useState<number | null>(null)
  if (!items || items.length === 0) return null
  return (
    <ul className="space-y-2">
      {items.map((o, i) => (
        <li
          key={i}
          className={
            "rounded-xl border p-3 " +
            (onChoose && chosenIndex === i
              ? "border-primary/50 bg-primary/5"
              : "border-border/40 bg-background/40")
          }
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[12px] text-muted-foreground">
              {o.approach}
            </span>
            <span className="inline-flex items-center gap-1.5">
            {onChoose && (
              <button
                type="button"
                onClick={() => onChoose(i)}
                aria-pressed={chosenIndex === i}
                className={
                  "inline-flex min-h-[36px] items-center gap-1 rounded-lg border px-2.5 text-[12px] font-medium transition " +
                  (chosenIndex === i
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border/50 text-muted-foreground hover:bg-background/70")
                }
              >
                <Check className="h-3 w-3" /> {chosenIndex === i ? "افتتاحيتك" : "اخترها"}
              </button>
            )}
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
            </span>
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
          "flex min-h-[44px] w-full items-center justify-between gap-2 px-3.5 py-2.5 text-[13px] font-medium transition hover:bg-background/60 " +
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
  approvedLevel,
}: {
  level: number
  interactive: boolean
  onSet: (level: number) => void
  /**
   * The energy the question ranking runs on, when it is NOT the displayed one.
   *
   * The two diverge by design while a director cue is unanswered — and after a
   * cue lapsed, the rail read "حادّ ●●●●●" while every question badge said
   * "يدفع للأمام", with nothing on screen explaining why. Two numbers are
   * defensible; two numbers in silence are not.
   */
  approvedLevel?: number
}) {
  const n = Math.max(0, Math.min(5, level))
  const approved = approvedLevel == null ? null : Math.max(0, Math.min(5, approvedLevel))
  // Only a GRADE difference matters — the ranking is a function of the band, so
  // 4 vs 5 is the same order and would be noise.
  const diverged = approved != null && energyBand(approved) !== energyBand(n)
  return (
    <span className="inline-flex items-center gap-1" title={`الطاقة ${n}/5`}>
      <Zap className="h-3.5 w-3.5 text-amber-600" />
      {/* The room talks in three grades (هادئ · متوسط · حادّ). The stored value
          stays 0–5 — five dots, one name — because every historical
          `energy_change` marker holds a 0–5 number and re-scaling would rewrite
          what those rows mean. */}
      <span className="text-[14px] font-medium text-amber-700">
        {ENERGY_BAND_LABEL_AR[energyBand(n)]}
      </span>
      {diverged && (
        <span
          className="rounded-full bg-muted/40 px-2 py-0.5 text-[12px] font-medium text-muted-foreground"
          title="اضغط على النقاط لاعتماد الطاقة المعروضة لترتيب أسئلتك"
        >
          ترتيبك على {ENERGY_BAND_LABEL_AR[energyBand(approved)]}
        </span>
      )}
      {/*
        The dot stays 8px VISUALLY; the hit area is the button around it.
        Previously the button itself was `h-2 w-2` — an 8×8px target with 2px
        of gap, which is unhittable with a thumb on a tablet (and the padding
        fix that was attempted landed on the wrapping span, so the buttons
        never grew at all).

        14×40px per step is a deliberate compromise, not the 44px ideal: this
        is a 5-step control living inside a compact strip that also carries the
        go-live CTA, and five 44px-wide targets would be 220px and wrap the bar
        on a 375px screen. 14×40 is ~10× the old area (64px² → 560px²) and the
        steps never overlap because the padding replaces the old gap rather
        than adding to it.
      */}
      <span className="inline-flex">
        {Array.from({ length: 5 }).map((_, i) =>
          interactive ? (
            <button
              key={i}
              type="button"
              /**
               * ALWAYS fires. The guard here used to be `i + 1 !== level`, with
               * `level` being the DISPLAYED energy — so once the two numbers
               * diverged (a lapsed cue leaves displayed at 5 and the ranking at
               * 3), tapping the dot that was already lit was swallowed: no
               * PATCH, no re-rank, nothing. A dead button in a cockpit during a
               * live take, and the same complaint that started all of this.
               *
               * The host's tap is an OWNER ACTION: it adopts the value for the
               * ranking and cancels any pending cue, whether or not the shared
               * number is already there. Re-asserting must be possible.
               */
              onClick={() => onSet(i + 1)}
              aria-label={`ضبط الطاقة على ${i + 1}`}
              // 44px tall — height is what decides whether a thumb lands. The
              // width is 44px from `sm` up and 28px on a phone, where five
              // 44px steps would not share a line with anything.
              className="group flex h-11 w-7 items-center justify-center rounded-md sm:w-11 [touch-action:manipulation]"
            >
              <span
                className={
                  "h-2 w-2 rounded-full transition " +
                  (i < n
                    ? "bg-amber-500"
                    : "bg-muted-foreground/25 group-hover:bg-amber-500/40")
                }
              />
            </button>
          ) : (
            <span key={i} className="flex h-11 w-7 items-center justify-center sm:w-11">
              <span
                className={
                  "h-2 w-2 rounded-full " +
                  (i < n ? "bg-amber-500" : "bg-muted-foreground/25")
                }
              />
            </span>
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
  research: { label: "دراسة", Icon: FlaskConical, chip: "bg-primary/10 text-primary" },
  date: { label: "تاريخ", Icon: Calendar, chip: "bg-indigo-500/10 text-indigo-700" },
  reference: { label: "مرجع", Icon: BookOpen, chip: "bg-primary/10 text-primary" },
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
    <div className="mt-2 w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/5 px-3.5 py-1.5 text-[13px] font-medium text-teal-700 transition hover:bg-teal-500/10"
      >
        <Lightbulb className="h-3.5 w-3.5" />
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

// ─── Sheet (overlay panel) ────────────────────────────────────────────

/**
 * A panel the host OPENS — team, section jump, reference, shortcuts.
 *
 * These used to open inline, in normal flow, above the question: the team
 * panel and the section grid pushed the question and the status rail (with
 * pause and end on it) off the top of the screen — measured at −56px on an
 * iPad. As an overlay nothing underneath moves. A bottom sheet on phones and
 * portrait tablets; a side sheet (the inline-end edge) from `lg` up, i.e. iPad
 * landscape, where the question stays readable beside it.
 *
 * `role="dialog"` is load-bearing: the recording surface forbids top-pinned
 * viewport overlays (tests/recording/error-banner-layout.test.ts) except
 * dialogs the host opened himself and can dismiss.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end lg:items-stretch lg:justify-end"
      dir="rtl"
    >
      <button
        type="button"
        aria-label="إغلاق"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-foreground/20"
      />
      <div className="relative max-h-[85vh] w-full overflow-y-auto rounded-t-2xl border-t border-border bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl lg:h-full lg:max-h-none lg:w-[440px] lg:rounded-none lg:border-s lg:border-t-0">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-[15px] font-semibold text-foreground">{title}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border/60 text-muted-foreground transition hover:bg-background/70"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/**
 * Publish a fixed bottom bar's measured height as `--khat-bottom-bar`, so
 * overlays that float above it (the error banner, the undo toast) clear it at
 * any height, and so the page can reserve the same space at its end.
 */
export function useBottomBarHeight(ref: RefObject<HTMLElement | null>): number {
  const [h, setH] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const apply = () => {
      const next = Math.ceil(el.getBoundingClientRect().height)
      setH(next)
      document.documentElement.style.setProperty("--khat-bottom-bar", `${next}px`)
    }
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    apply()
    return () => {
      ro.disconnect()
      document.documentElement.style.removeProperty("--khat-bottom-bar")
    }
  }, [ref])
  return h
}

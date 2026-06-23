"use client"

/**
 * Fact-Check & Enrich — the insight review gate.
 *
 * Pre-recording surface (preparation tab) where a producer vets the insights
 * Pass 5 generated before any can surface live: approve / hide / reset each
 * card, edit its claim (which marks it human-owned), add a manual card, or
 * delete one. Bulk-approve all grounded-verified cards in one click.
 *
 * Optimistic updates reuse the SAME pure transitions the server action runs
 * (lib/preparation/v2/insight-review.ts), so the local view and the persisted
 * payload never diverge; the server action stamps the real reviewer + persists.
 */

import { useEffect, useState, useTransition } from "react"
import {
  Lightbulb,
  Check,
  EyeOff,
  Clock,
  Trash2,
  Plus,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Pencil,
  X,
  Info,
  BarChart3,
  FlaskConical,
  Calendar,
  BookOpen,
  Smile,
  type LucideIcon,
} from "lucide-react"
import {
  setInsightStatus,
  editInsight,
  removeInsight,
  addManualInsight,
  bulkApproveVerified,
  type ManualInsightInput,
  type ReviewStamp,
} from "@/lib/preparation/v2/insight-review"
import {
  insightLiveStatus,
  INSIGHT_TIMINGS,
  INSIGHT_TYPES,
  type InsightLiveStatus,
  type InsightTiming,
  type InsightType,
  type PrepV2Insight,
  type PrepV2InsightSource,
  type PrepV2Payload,
  type PrepV2Question,
  type SectionKind,
} from "@/lib/preparation/v2/types"
import {
  setInsightStatusAction,
  editInsightAction,
  removeInsightAction,
  addManualInsightAction,
  approveAllVerifiedInsightsAction,
} from "./prep-actions"

const SECTION_LABEL_AR: Record<SectionKind, string> = {
  opening: "افتتاحية",
  build_up: "بناء التوتر",
  conflict: "المواجهة",
  deep_dive: "الغوص العميق",
  emotional_peak: "الذروة العاطفية",
  resolution: "الخاتمة",
}

const INSIGHT_META: Record<InsightType, { label: string; Icon: LucideIcon; chip: string }> = {
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

const STATUS_OPTIONS: { key: InsightLiveStatus; label: string; Icon: LucideIcon; active: string }[] = [
  { key: "approved", label: "بث", Icon: Check, active: "border-emerald-500/50 bg-emerald-500/15 text-emerald-700" },
  { key: "pending", label: "مراجعة", Icon: Clock, active: "border-amber-500/50 bg-amber-500/15 text-amber-700" },
  { key: "hidden", label: "إخفاء", Icon: EyeOff, active: "border-slate-400/50 bg-slate-400/15 text-slate-700" },
]

const LOCAL_STAMP: ReviewStamp = { reviewer: null, at: "" }

export function PrepInsightReview({
  prepId,
  payload,
}: {
  prepId: string
  payload: PrepV2Payload
}) {
  const [bank, setBank] = useState<PrepV2Question[]>(payload.question_bank)
  const [busy, startTransition] = useTransition()
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)

  // Resync from the server after a revalidatePath re-render (the action stamped
  // the real reviewer + persisted the change). Optimistic updates survive in
  // between because the parent doesn't re-render until the action commits, so
  // `payload` identity is stable during the optimistic window.
  useEffect(() => {
    setBank(payload.question_bank)
  }, [payload])

  const all = bank.flatMap((q) => q.insights ?? [])
  if (all.length === 0) return null // nothing generated yet — keep the tab clean

  const counts = {
    approved: all.filter((i) => insightLiveStatus(i) === "approved").length,
    pending: all.filter((i) => insightLiveStatus(i) === "pending").length,
    hidden: all.filter((i) => insightLiveStatus(i) === "hidden").length,
  }
  const verifiedPending = all.filter(
    (i) => insightLiveStatus(i) === "pending" && i.confidence === "verified",
  ).length

  const withInsights = bank.filter((q) => (q.insights?.length ?? 0) > 0)
  const sectionOf = (q: PrepV2Question) => SECTION_LABEL_AR[q.section] ?? q.section

  /** Optimistically apply a pure transition, then persist via the action. */
  function run(
    localMutate: (b: PrepV2Question[]) => { bank: PrepV2Question[] },
    action: () => Promise<{ ok: boolean; message: string }>,
  ) {
    const snapshot = bank
    setBank(localMutate(bank).bank)
    startTransition(async () => {
      try {
        const r = await action()
        setToast({ ok: r.ok, msg: r.message })
        if (!r.ok) setBank(snapshot)
      } catch {
        setToast({ ok: false, msg: "تعذّر حفظ التغيير." })
        setBank(snapshot)
      }
    })
  }

  const onStatus = (q: PrepV2Question, ins: PrepV2Insight, status: InsightLiveStatus) =>
    run(
      (b) => setInsightStatus(b, q.id, ins.id, status, LOCAL_STAMP),
      () => setInsightStatusAction(prepId, q.id, ins.id, status),
    )

  const onEdit = (q: PrepV2Question, ins: PrepV2Insight, text: string) =>
    run(
      (b) => editInsight(b, q.id, ins.id, { text }, LOCAL_STAMP),
      () => editInsightAction(prepId, q.id, ins.id, { text }),
    )

  const onRemove = (q: PrepV2Question, ins: PrepV2Insight) =>
    run(
      (b) => removeInsight(b, q.id, ins.id),
      () => removeInsightAction(prepId, q.id, ins.id),
    )

  const onAddManual = (q: PrepV2Question, input: ManualForm) => {
    // Share one client-generated id between the optimistic update and the
    // server write so the new card stays actionable before the next refresh.
    const withId: ManualInsightInput = {
      ...input,
      id: `ins-manual-${crypto.randomUUID()}`,
    }
    run(
      (b) => ({ bank: addManualInsight(b, q.id, withId, LOCAL_STAMP).bank }),
      () => addManualInsightAction(prepId, q.id, withId),
    )
  }

  const onBulkApprove = () =>
    run(
      (b) => ({ bank: bulkApproveVerified(b, LOCAL_STAMP).bank }),
      () => approveAllVerifiedInsightsAction(prepId),
    )

  return (
    <div className="space-y-3 rounded-3xl border border-teal-500/20 bg-teal-500/[0.03] p-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-teal-700">
            <Lightbulb className="h-3.5 w-3.5" />
            بطاقات الإسناد — مراجعة قبل البث
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            البطاقات المُولّدة موثّقة بمصادر لكنها لا تظهر في غرفة التسجيل قبل
            اعتمادها هنا. اعتمد ما هو صالح، أخفِ الباقي، وأضف بطاقاتك الخاصة.
          </p>
        </div>
        {verifiedPending > 0 && (
          <button
            type="button"
            onClick={onBulkApprove}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[11.5px] font-medium text-emerald-700 transition hover:bg-emerald-500/20 disabled:opacity-50"
          >
            <ShieldCheck className="h-3.5 w-3.5" /> اعتماد كل الموثوقة ({verifiedPending})
          </button>
        )}
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <CountChip tone="emerald" label="معتمدة" n={counts.approved} />
        <CountChip tone="amber" label="بانتظار المراجعة" n={counts.pending} />
        <CountChip tone="slate" label="مخفية" n={counts.hidden} />
        {toast && (
          <span
            className={
              "ms-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 " +
              (toast.ok ? "bg-emerald-500/10 text-emerald-700" : "bg-rose-500/10 text-rose-700")
            }
          >
            {toast.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            {toast.msg}
          </span>
        )}
      </div>

      {/* Questions with insights */}
      <div className="space-y-3">
        {withInsights.map((q) => (
          <div
            key={q.id}
            className="rounded-2xl border border-border/40 bg-background/50 p-3.5"
          >
            <div className="mb-2 flex items-start gap-2">
              <span className="mt-0.5 shrink-0 rounded-full bg-muted/40 px-1.5 py-0.5 text-[9.5px] text-muted-foreground">
                {sectionOf(q)}
              </span>
              <span className="text-[13px] font-medium leading-snug text-foreground">
                {q.text}
              </span>
            </div>
            <div className="space-y-2">
              {(q.insights ?? []).map((ins) => (
                <InsightReviewRow
                  key={ins.id}
                  insight={ins}
                  busy={busy}
                  onStatus={(s) => onStatus(q, ins, s)}
                  onEdit={(text) => onEdit(q, ins, text)}
                  onRemove={() => onRemove(q, ins)}
                />
              ))}
            </div>
            <AddManualCard busy={busy} onAdd={(input) => onAddManual(q, input)} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Insight review row ───────────────────────────────────────────────

function InsightReviewRow(props: {
  insight: PrepV2Insight
  busy: boolean
  onStatus: (status: InsightLiveStatus) => void
  onEdit: (text: string) => void
  onRemove: () => void
}) {
  const ins = props.insight
  const meta = INSIGHT_META[ins.type]
  const Icon = meta.Icon
  const status = insightLiveStatus(ins)
  const isCorrection = ins.type === "correction" && !!ins.correction
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(ins.text)

  return (
    <div
      className={
        "rounded-xl border p-2.5 " +
        (isCorrection ? "border-amber-500/40 bg-amber-500/5" : "border-border/40 bg-background/40")
      }
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span className={"inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium " + meta.chip}>
          <Icon className="h-2.5 w-2.5" /> {meta.label}
        </span>
        <span className="inline-flex items-center gap-0.5 rounded-full border border-border/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          <Clock className="h-2.5 w-2.5" /> {TIMING_LABEL_AR[ins.timing]}
        </span>
        <ConfidenceChip insight={ins} />
        {ins.manual && (
          <span className="rounded-full bg-teal-500/10 px-1.5 py-0.5 text-[10px] font-medium text-teal-700">
            يدوي
          </span>
        )}
      </div>

      {editing ? (
        <div className="mb-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            className="w-full resize-y rounded-lg border border-border/50 bg-background/60 p-2 text-[12.5px] leading-relaxed text-foreground focus:border-teal-500/50 focus:outline-none"
          />
          <div className="mt-1 flex items-center gap-1.5">
            <button
              type="button"
              disabled={props.busy || draft.trim().length < 2}
              onClick={() => {
                props.onEdit(draft)
                setEditing(false)
              }}
              className="rounded-lg border border-teal-500/40 bg-teal-500/10 px-2 py-1 text-[11px] font-medium text-teal-700 disabled:opacity-40"
            >
              حفظ
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(ins.text)
                setEditing(false)
              }}
              className="rounded-lg border border-border/50 px-2 py-1 text-[11px] text-muted-foreground hover:bg-background/70"
            >
              إلغاء
            </button>
            <span className="text-[10px] text-amber-700">
              تعديل النص يجعل البطاقة «يدوية» (مسؤوليتك التحريرية).
            </span>
          </div>
        </div>
      ) : isCorrection && ins.correction ? (
        <div className="mb-2 text-[12.5px] leading-relaxed">
          <div>
            <span className="text-amber-700">إن قال الضيف:</span> {ins.correction.inaccuracy}
          </div>
          <div className="mt-0.5">
            <span className="text-emerald-700">الصحيح:</span> {ins.correction.accurate}
          </div>
        </div>
      ) : (
        <div className="mb-2 text-[12.5px] leading-relaxed text-foreground">{ins.text}</div>
      )}

      {ins.sources.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1">
          {ins.sources.map((s, i) => (
            <SourceLink key={i} source={s} />
          ))}
        </div>
      )}

      {/* Status segmented control + edit/delete */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="inline-flex overflow-hidden rounded-lg border border-border/50">
          {STATUS_OPTIONS.map((opt) => {
            const ActiveIcon = opt.Icon
            const isActive = status === opt.key
            return (
              <button
                key={opt.key}
                type="button"
                disabled={props.busy || isActive}
                onClick={() => props.onStatus(opt.key)}
                title={opt.label}
                className={
                  "inline-flex items-center gap-1 px-2 py-1 text-[10.5px] font-medium transition " +
                  (isActive
                    ? opt.active
                    : "text-muted-foreground hover:bg-background/70 disabled:opacity-40")
                }
              >
                <ActiveIcon className="h-3 w-3" /> {opt.label}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          disabled={props.busy}
          onClick={() => setEditing((e) => !e)}
          title="تعديل النص"
          className="inline-flex items-center gap-1 rounded-lg border border-border/50 px-2 py-1 text-[10.5px] text-muted-foreground hover:bg-background/70 disabled:opacity-40"
        >
          <Pencil className="h-3 w-3" /> تعديل
        </button>
        <button
          type="button"
          disabled={props.busy}
          onClick={props.onRemove}
          title="حذف البطاقة"
          className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 px-2 py-1 text-[10.5px] text-rose-700 hover:bg-rose-500/10 disabled:opacity-40"
        >
          <Trash2 className="h-3 w-3" /> حذف
        </button>
      </div>
    </div>
  )
}

// ─── Add manual card ──────────────────────────────────────────────────

interface ManualForm {
  type: InsightType
  text: string
  timing: InsightTiming
  sourceUrl?: string
  correction?: { inaccuracy: string; accurate: string }
}

function AddManualCard({
  busy,
  onAdd,
}: {
  busy: boolean
  onAdd: (input: ManualForm) => void
}) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<InsightType>("fact")
  const [timing, setTiming] = useState<InsightTiming>("during")
  const [text, setText] = useState("")
  const [sourceUrl, setSourceUrl] = useState("")
  const [inaccuracy, setInaccuracy] = useState("")
  const [accurate, setAccurate] = useState("")

  const isCorrection = type === "correction"
  const valid = isCorrection
    ? text.trim().length >= 2 && inaccuracy.trim().length >= 2 && accurate.trim().length >= 2
    : text.trim().length >= 2

  function reset() {
    setText("")
    setSourceUrl("")
    setInaccuracy("")
    setAccurate("")
    setType("fact")
    setTiming("during")
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-teal-700 hover:underline"
      >
        <Plus className="h-3 w-3" /> أضف بطاقة يدوية
      </button>
    )
  }

  return (
    <div className="mt-2 rounded-xl border border-teal-500/30 bg-teal-500/[0.04] p-2.5">
      <div className="mb-2 flex flex-wrap gap-1.5">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as InsightType)}
          className="rounded-lg border border-border/50 bg-background/60 px-2 py-1 text-[11px] text-foreground"
        >
          {INSIGHT_TYPES.map((t) => (
            <option key={t} value={t}>
              {INSIGHT_META[t].label}
            </option>
          ))}
        </select>
        <select
          value={timing}
          onChange={(e) => setTiming(e.target.value as InsightTiming)}
          className="rounded-lg border border-border/50 bg-background/60 px-2 py-1 text-[11px] text-foreground"
        >
          {INSIGHT_TIMINGS.map((t) => (
            <option key={t} value={t}>
              {TIMING_LABEL_AR[t]}
            </option>
          ))}
        </select>
      </div>

      {isCorrection ? (
        <div className="mb-2 space-y-1.5">
          <div className="text-[10px] text-amber-700">جميع الحقول الثلاثة مطلوبة للتصحيح.</div>
          <input
            value={inaccuracy}
            onChange={(e) => setInaccuracy(e.target.value)}
            placeholder="إن قال الضيف… (المعلومة الخاطئة)"
            className="w-full rounded-lg border border-border/50 bg-background/60 p-2 text-[12px] text-foreground placeholder:text-muted-foreground focus:border-teal-500/50 focus:outline-none"
          />
          <input
            value={accurate}
            onChange={(e) => setAccurate(e.target.value)}
            placeholder="الصحيح… (الحقيقة الدقيقة)"
            className="w-full rounded-lg border border-border/50 bg-background/60 p-2 text-[12px] text-foreground placeholder:text-muted-foreground focus:border-teal-500/50 focus:outline-none"
          />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="عنوان مختصر للبطاقة"
            className="w-full rounded-lg border border-border/50 bg-background/60 p-2 text-[12px] text-foreground placeholder:text-muted-foreground focus:border-teal-500/50 focus:outline-none"
          />
        </div>
      ) : (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="نص البطاقة — جاهز للقراءة"
          className="mb-2 w-full resize-y rounded-lg border border-border/50 bg-background/60 p-2 text-[12.5px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:border-teal-500/50 focus:outline-none"
        />
      )}

      <input
        value={sourceUrl}
        onChange={(e) => setSourceUrl(e.target.value)}
        placeholder="رابط مصدر (اختياري) https://…"
        dir="ltr"
        className="mb-2 w-full rounded-lg border border-border/50 bg-background/60 p-2 text-[11.5px] text-foreground placeholder:text-muted-foreground focus:border-teal-500/50 focus:outline-none"
      />

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={busy || !valid}
          onClick={() => {
            onAdd({
              type,
              text,
              timing,
              sourceUrl: sourceUrl.trim() || undefined,
              correction: isCorrection
                ? { inaccuracy: inaccuracy.trim(), accurate: accurate.trim() }
                : undefined,
            })
            reset()
            setOpen(false)
          }}
          className="rounded-lg border border-teal-500/40 bg-teal-500/10 px-2.5 py-1 text-[11px] font-medium text-teal-700 disabled:opacity-40"
        >
          إضافة (معتمدة)
        </button>
        <button
          type="button"
          onClick={() => {
            reset()
            setOpen(false)
          }}
          className="rounded-lg border border-border/50 px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-background/70"
        >
          إلغاء
        </button>
      </div>
    </div>
  )
}

// ─── Small shared bits ────────────────────────────────────────────────

function ConfidenceChip({ insight }: { insight: PrepV2Insight }) {
  if (insight.manual) {
    return null // human-vouched; the "يدوي" badge already conveys it
  }
  if (insight.confidence === "verified") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
        <ShieldCheck className="h-2.5 w-2.5" /> موثوق
      </span>
    )
  }
  if (insight.confidence === "partial") {
    return (
      <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
        جزئي
      </span>
    )
  }
  return (
    <span className="rounded-full bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
      غير مؤكد
    </span>
  )
}

function SourceLink({ source }: { source: PrepV2InsightSource }) {
  const host = (() => {
    try {
      return new URL(source.url).hostname.replace(/^www\./, "")
    } catch {
      return source.publisher ?? source.title
    }
  })()
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noreferrer"
      title={source.title}
      className="inline-flex max-w-[220px] items-center gap-1 truncate text-[11px] text-sky-700 hover:underline"
    >
      <ExternalLink className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate">{source.publisher ?? host}</span>
    </a>
  )
}

function CountChip({
  tone,
  label,
  n,
}: {
  tone: "emerald" | "amber" | "slate"
  label: string
  n: number
}) {
  const cls =
    tone === "emerald"
      ? "bg-emerald-500/10 text-emerald-700"
      : tone === "amber"
        ? "bg-amber-500/10 text-amber-700"
        : "bg-slate-400/15 text-slate-700"
  return (
    <span className={"inline-flex items-center gap-1 rounded-full px-2 py-0.5 " + cls}>
      <span className="tabular-nums" dir="ltr">
        {n}
      </span>
      {label}
    </span>
  )
}

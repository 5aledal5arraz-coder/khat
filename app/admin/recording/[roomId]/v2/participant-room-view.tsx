"use client"

/**
 * ParticipantRoomView — Phase 2 of the collab→V2 fold.
 *
 * The role-based live view for NON-host participants (director / viewer /
 * photographer / editor). It reads the SSE-synced room state
 * (`current_section_index`, recording `status`) and renders the matching
 * prep_v2 section + questions live — so everyone follows what the host is
 * driving from the cockpit. Director sees the richer director_guidance +
 * full question metadata; viewers get a calm read-only follow-along.
 */

import { useMemo, useState } from "react"
import { useRoomState, useRoomMarkers } from "@/app/admin/preparation/[id]/room/contexts"
import { cn } from "@/lib/utils"
import type { LiveV2Snapshot } from "@/lib/recording-v2/load"
import type { PrepV2Question, PrepV2Payload, SectionKind } from "@/lib/preparation/v2/types"
import {
  Circle, Film, Quote, Volume2, Scissors, AlertTriangle,
  Flag, Loader2, Trash2,
  Camera, Clapperboard, Sparkles, Zap, BookOpen, ChevronDown, ChevronUp, Check,
} from "lucide-react"
import { Empty } from "../../../components/ui-kit"
import { RoomNotesPanel } from "./room-notes-panel"
import { markerStyle } from "./recording-shared"
import {
  DIRECTOR_MARKER_TYPES,
  QUICK_MARKER_META,
  type QuickMarkerType,
} from "@/lib/recording-v2/marker-types"

const SECTION_LABEL_AR: Record<SectionKind, string> = {
  opening: "افتتاحية",
  build_up: "بناء التوتر",
  conflict: "المواجهة",
  deep_dive: "الغوص العميق",
  emotional_peak: "الذروة العاطفية",
  resolution: "الخاتمة",
}

const STATUS_AR: Record<string, string> = {
  waiting: "بانتظار البدء",
  live: "تسجيل مباشر",
  paused: "متوقّف مؤقّتاً",
  ended: "انتهى",
}

function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`
}

/**
 * Director-only toolbar to flag a live moment; broadcasts over SSE to the room.
 * Draws from the shared quick-marker taxonomy (director-relevant subset).
 */
function DirectorMarkerBar({ disabled }: { disabled: boolean }) {
  const { addMarker } = useRoomMarkers()
  const [pending, setPending] = useState<QuickMarkerType | null>(null)

  const flag = async (type: QuickMarkerType) => {
    if (disabled || pending) return
    setPending(type)
    try {
      await addMarker(type, QUICK_MARKER_META[type].defaultLabel)
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="rounded-2xl border border-violet-500/25 bg-violet-500/5 p-3">
      <div className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-violet-700">
        <Flag className="h-3 w-3" /> وضع علامة مباشرة
      </div>
      <div className="flex flex-wrap gap-2">
        {DIRECTOR_MARKER_TYPES.map((type) => {
          const st = markerStyle(type)
          const Icon = st.icon
          return (
            <button
              key={type}
              type="button"
              onClick={() => void flag(type)}
              disabled={disabled || pending !== null}
              title={QUICK_MARKER_META[type].hint}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-card/60 px-3 py-1.5 text-[12px] font-medium transition hover:bg-card disabled:cursor-not-allowed disabled:opacity-40",
                st.text,
              )}
            >
              {pending === type ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Icon className="h-3.5 w-3.5" />
              )}
              {QUICK_MARKER_META[type].label}
            </button>
          )
        })}
      </div>
      {disabled && (
        <p className="mt-2 text-[10.5px] text-muted-foreground">
          يبدأ وضع العلامات عند بدء التسجيل.
        </p>
      )}
    </div>
  )
}

/**
 * Live feed of session markers, shared by the director view (inline, deletable)
 * and the host cockpit (floating overlay). Shows every room-broadcast marker on
 * the shared taxonomy so the whole team sees flagged moments as they happen.
 */
export function TeamMarkerFeed({
  floating = false,
  canDelete = false,
}: {
  floating?: boolean
  canDelete?: boolean
}) {
  const { markers, deleteMarker } = useRoomMarkers()
  const [open, setOpen] = useState(true)

  // energy_change is a system marker (drives the timeline ribbon) — not shown
  // in the team feed. Memoized so the open/close toggle doesn't re-filter.
  const ops = useMemo(
    () => markers.filter((m) => m.marker_type !== "energy_change").reverse(),
    [markers],
  )

  const renderItem = (m: (typeof ops)[number]) => {
    const st = markerStyle(m.marker_type)
    const Icon = st.icon
    return (
      <li
        key={m.id}
        className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-card/40 px-2.5 py-1.5 text-[12px]"
      >
        <span className={"inline-flex items-center gap-1.5 " + st.text}>
          <Icon className="h-3.5 w-3.5" />
          <span className="font-medium">{st.label}</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <time className="tabular-nums text-[10.5px] text-muted-foreground" dir="ltr">
            {formatClock(m.recording_ms)}
          </time>
          {canDelete && (
            <button
              type="button"
              onClick={() => void deleteMarker(m.id)}
              className="text-muted-foreground/60 transition hover:text-rose-600"
              aria-label="حذف العلامة"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </span>
      </li>
    )
  }

  if (floating) {
    if (ops.length === 0) return null
    return (
      <div className="fixed bottom-3 start-3 z-40 w-64 max-w-[80vw]" dir="rtl">
        <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/95 shadow-lg backdrop-blur">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-semibold"
          >
            <span className="inline-flex items-center gap-1.5">
              <Flag className="h-3 w-3 text-violet-600" /> ملاحظات الفريق
            </span>
            <span className="rounded-full bg-violet-500/10 px-1.5 text-[10.5px] text-violet-700">
              {ops.length}
            </span>
          </button>
          {open && (
            <ul className="max-h-56 space-y-1 overflow-auto px-3 pb-3">
              {ops.slice(0, 8).map(renderItem)}
            </ul>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border/40 bg-card/30 p-3">
      <div className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
        <Flag className="h-3 w-3" /> العلامات المسجّلة
      </div>
      {ops.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">لا علامات بعد.</p>
      ) : (
        <ul className="space-y-1">{ops.map(renderItem)}</ul>
      )}
    </div>
  )
}

export function ParticipantRoomView({
  initial,
  role,
}: {
  initial: LiveV2Snapshot
  role: string
}) {
  const { room, updateEnergy } = useRoomState()
  const prep = initial.preparation.prep_v2
  const isDirector = role === "director"
  const isPhotographer = role === "photographer"
  const isEditor = role === "editor"

  if (!prep || !prep.episode_sections?.length) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Empty text="لا توجد بنية إعداد (prep_v2) لهذه الحلقة بعد." />
      </div>
    )
  }

  const sections = prep.episode_sections
  const idx = Math.min(
    Math.max(0, room?.current_section_index ?? 0),
    sections.length - 1,
  )
  const section = sections[idx]
  const questions: PrepV2Question[] = prep.question_bank.filter(
    (q) => q.section === section.kind,
  )
  const status = room?.status ?? initial.room.status
  // Plain Set (not useMemo) — this view sits after an early return, and it only
  // re-renders on infrequent SSE room updates, so rebuilding is negligible.
  const completedQ = new Set(
    room?.completed_question_ids ?? initial.room.completed_question_ids ?? [],
  )

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 pb-20" dir="rtl">
      {/* Live status + section progress */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/40 bg-card/30 p-3">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold">
          <Circle
            className={
              "h-2.5 w-2.5 " +
              (status === "live"
                ? "fill-rose-500 text-rose-500 animate-pulse"
                : "fill-muted-foreground/40 text-muted-foreground/40")
            }
          />
          {STATUS_AR[status] ?? status}
        </span>
        <div className="flex items-center gap-3">
          <EnergyDots level={room?.energy_level ?? 3} />
          <span className="text-[11px] text-muted-foreground tabular-nums">
            القسم {idx + 1} / {sections.length}
          </span>
        </div>
      </div>

      {/* Active section */}
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-primary/80">
          {SECTION_LABEL_AR[section.kind] ?? section.kind}
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-foreground/90">
          {section.intent}
        </p>
        {(isDirector || isPhotographer) && (
          <div className="mt-2 flex flex-wrap gap-2 text-[10.5px] text-muted-foreground">
            <span className="rounded-full border border-border/50 px-2 py-0.5">
              المشاعر المستهدفة: {section.target_emotion}
            </span>
            <span className="rounded-full border border-border/50 px-2 py-0.5">
              ~{section.estimated_minutes} د
            </span>
          </div>
        )}
      </div>

      {/* Director: set the room energy — the live cue to the host */}
      {isDirector && (
        <DirectorEnergyControl
          energy={room?.energy_level ?? initial.room.energy_level ?? 3}
          onSet={updateEnergy}
        />
      )}

      {/* Director: flag live moments (broadcasts to the whole room over SSE) */}
      {isDirector && (
        <DirectorMarkerBar disabled={status === "waiting" || status === "ended"} />
      )}

      {/* Questions of the active section */}
      <div className="space-y-2">
        {questions.length === 0 ? (
          <Empty text="لا أسئلة في هذا القسم." />
        ) : (
          questions.map((q) => {
            const done = completedQ.has(q.id)
            return (
            <div
              key={q.id}
              className={
                "rounded-xl border p-3 transition " +
                (done
                  ? "border-emerald-500/30 bg-emerald-500/5 opacity-70"
                  : "border-border/50 bg-card/40")
              }
            >
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                {q.priority === "must_ask" && (
                  <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9.5px] font-bold text-emerald-700">
                    أساسي
                  </span>
                )}
                <span className="rounded bg-muted/40 px-1.5 py-0.5 text-[9.5px] text-muted-foreground">
                  {q.types.join(" · ")}
                </span>
                {isDirector && q.risk_level && q.risk_level !== "low" && (
                  <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9.5px] text-amber-700">
                    حساسية: {q.risk_level}
                  </span>
                )}
                {done && (
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9.5px] font-bold text-emerald-700">
                    <Check className="h-2.5 w-2.5" /> تم طرحه
                  </span>
                )}
              </div>
              <p
                className={
                  "text-[14px] font-semibold leading-relaxed " +
                  (done ? "text-muted-foreground line-through" : "")
                }
              >
                {q.text}
              </p>
              {isDirector && q.follow_up_prompt && (
                <p className="mt-1 text-[11.5px] text-muted-foreground">
                  ↳ {q.follow_up_prompt}
                </p>
              )}
            </div>
            )
          })
        )}
      </div>

      {/* Director-only guidance for this recording */}
      {isDirector && prep.director_guidance && (
        <div className="rounded-2xl border border-violet-500/25 bg-violet-500/5 p-4">
          <div className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-violet-700">
            <Film className="h-3 w-3" /> توجيهات الإخراج
          </div>
          <GuidanceList
            icon={<Quote className="h-3 w-3" />}
            label="لقطات أولوية"
            items={prep.director_guidance.shot_priorities}
          />
          <GuidanceList
            icon={<Volume2 className="h-3 w-3" />}
            label="لحظات الصمت"
            items={prep.director_guidance.silence_moments}
          />
          <GuidanceList
            icon={<Scissors className="h-3 w-3" />}
            label="تحذيرات القطع"
            items={prep.director_guidance.cut_warnings}
          />
          {prep.sensitive_zones?.length > 0 && (
            <GuidanceList
              icon={<AlertTriangle className="h-3 w-3 text-amber-600" />}
              label="مناطق حسّاسة"
              items={prep.sensitive_zones}
            />
          )}
        </div>
      )}

      {/* Photographer: visual / framing focus */}
      {isPhotographer && prep.director_guidance && (
        <div className="rounded-2xl border border-sky-500/25 bg-sky-500/5 p-4">
          <div className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-sky-700">
            <Camera className="h-3 w-3" /> دليل التصوير
          </div>
          <GuidanceList
            icon={<Quote className="h-3 w-3" />}
            label="لقطات أولوية"
            items={prep.director_guidance.shot_priorities}
          />
          <GuidanceList
            icon={<Volume2 className="h-3 w-3" />}
            label="لحظات الصمت — ثبات الكاميرا"
            items={prep.director_guidance.silence_moments}
          />
          {prep.sensitive_zones?.length > 0 && (
            <GuidanceList
              icon={<AlertTriangle className="h-3 w-3 text-amber-600" />}
              label="مناطق حسّاسة — انتبه للتأطير"
              items={prep.sensitive_zones}
            />
          )}
        </div>
      )}

      {/* Editor: post-production / clip focus */}
      {isEditor && (
        <div className="rounded-2xl border border-fuchsia-500/25 bg-fuchsia-500/5 p-4">
          <div className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-fuchsia-700">
            <Clapperboard className="h-3 w-3" /> دليل المونتاج
          </div>
          {prep.director_guidance && (
            <GuidanceList
              icon={<Scissors className="h-3 w-3" />}
              label="تحذيرات القطع"
              items={prep.director_guidance.cut_warnings}
            />
          )}
          <GuidanceList
            icon={<Sparkles className="h-3 w-3" />}
            label="مقاطع محتملة (أسئلة مفصلية)"
            items={prep.question_bank
              .filter((q) => q.priority === "must_ask")
              .slice(0, 4)
              .map((q) => q.text)}
          />
        </div>
      )}

      {/* Director: live feed of the moments flagged this session */}
      {isDirector && <TeamMarkerFeed canDelete />}

      {/* Reference material — episode backbone, available to every role */}
      <MaterialsPanel prep={prep} />

      {/* Team notes — any participant posts; the host sees + marks them seen */}
      <RoomNotesPanel sectionKey={section.kind} role={role} />
    </div>
  )
}

function GuidanceList({
  icon,
  label,
  items,
}: {
  icon: React.ReactNode
  label: string
  items: string[]
}) {
  if (!items?.length) return null
  return (
    <div className="mt-2">
      <div className="mb-1 inline-flex items-center gap-1 text-[10.5px] font-semibold text-muted-foreground">
        {icon} {label}
      </div>
      <ul className="space-y-0.5 ps-3">
        {items.map((it, i) => (
          <li
            key={i}
            className="list-disc text-[11.5px] leading-relaxed text-foreground/85"
          >
            {it}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Live room-energy indicator (0–5), set by the host, shown to everyone. */
/** Director's primary input: set the room energy → live cue to the host. */
function DirectorEnergyControl({
  energy,
  onSet,
}: {
  energy: number
  onSet: (level: number) => void
}) {
  const [pending, setPending] = useState(false)
  const set = async (level: number) => {
    const clamped = Math.max(0, Math.min(5, level))
    if (clamped === energy || pending) return
    setPending(true)
    try {
      await onSet(clamped)
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700">
          <Zap className="h-3 w-3" /> طاقة الغرفة
        </span>
        <span className="text-[10.5px] tabular-nums text-muted-foreground" dir="ltr">
          {energy}/5
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void set(energy - 1)}
          disabled={pending || energy <= 0}
          aria-label="خفّض الطاقة"
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/60 text-muted-foreground transition hover:bg-muted/40 disabled:opacity-40"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
        <div className="flex flex-1 items-center justify-center gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => void set(n)}
              disabled={pending}
              aria-label={`ضبط الطاقة على ${n}`}
              className={cn(
                "h-7 w-7 rounded-full border text-[11px] font-semibold transition disabled:opacity-50",
                n <= energy
                  ? "border-amber-500 bg-amber-500 text-white"
                  : "border-border/60 text-muted-foreground hover:border-amber-400",
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void set(energy + 1)}
          disabled={pending || energy >= 5}
          aria-label="ارفع الطاقة"
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/60 text-muted-foreground transition hover:bg-muted/40 disabled:opacity-40"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground">
        يراها المضيف فوراً — إشارتك لرفع الحدّة أو خفضها.
      </p>
    </div>
  )
}

function EnergyDots({ level }: { level: number }) {
  const n = Math.max(0, Math.min(5, level))
  return (
    <span
      className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground"
      title="مستوى الطاقة"
    >
      <Zap className="h-3 w-3 text-amber-500" />
      <span className="inline-flex gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              i < n ? "bg-amber-500" : "bg-muted-foreground/25",
            )}
          />
        ))}
      </span>
    </span>
  )
}

/** Collapsible reference panel — the episode backbone (thesis, axes, openings/closings). */
function MaterialsPanel({ prep }: { prep: PrepV2Payload }) {
  const [open, setOpen] = useState(false)
  const hasContent =
    !!prep.thesis ||
    prep.axes_of_tension?.length > 0 ||
    prep.opening_options?.length > 0 ||
    prep.closing_options?.length > 0
  if (!hasContent) return null

  return (
    <div className="rounded-2xl border border-border/40 bg-card/30">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between p-3 text-[11px] font-semibold text-muted-foreground"
      >
        <span className="inline-flex items-center gap-1.5">
          <BookOpen className="h-3 w-3" /> مواد ومراجع الحلقة
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-3 px-4 pb-4">
          {prep.thesis && (
            <div>
              <div className="mb-1 text-[10.5px] font-semibold text-muted-foreground">
                الأطروحة
              </div>
              <p className="text-[12.5px] leading-relaxed text-foreground/90">
                {prep.thesis}
              </p>
            </div>
          )}
          {prep.axes_of_tension?.length > 0 && (
            <GuidanceList
              icon={<Zap className="h-3 w-3" />}
              label="محاور التوتر"
              items={prep.axes_of_tension}
            />
          )}
          {prep.opening_options?.length > 0 && (
            <OptionList label="خيارات الافتتاح" options={prep.opening_options} />
          )}
          {prep.closing_options?.length > 0 && (
            <OptionList label="خيارات الختام" options={prep.closing_options} />
          )}
        </div>
      )}
    </div>
  )
}

function OptionList({
  label,
  options,
}: {
  label: string
  options: { approach: string; text: string }[]
}) {
  return (
    <div>
      <div className="mb-1 text-[10.5px] font-semibold text-muted-foreground">{label}</div>
      <ul className="space-y-1">
        {options.map((o, i) => (
          <li
            key={i}
            className="rounded-lg border border-border/40 bg-card/40 px-2.5 py-1.5 text-[12px] leading-relaxed"
          >
            <span className="font-medium text-foreground/70">{o.approach}: </span>
            {o.text}
          </li>
        ))}
      </ul>
    </div>
  )
}

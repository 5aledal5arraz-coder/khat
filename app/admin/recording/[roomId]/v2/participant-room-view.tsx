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

import { useEffect, useMemo, useRef, useState } from "react"
import {
  useRoomState,
  useRoomMarkers,
  useRoomChecklist,
  useRoomConnection,
} from "@/app/admin/preparation/[id]/room/contexts"
import { cn } from "@/lib/utils"
import type { LiveV2Snapshot } from "@/lib/recording-v2/load"
import type { PrepV2Question, PrepV2Payload, SectionKind } from "@/lib/preparation/v2/types"
import {
  Circle, Film, Quote, Volume2, Scissors, AlertTriangle,
  Flag, Loader2, Trash2,
  Camera, Clapperboard, Sparkles, Zap, BookOpen, ChevronDown, ChevronUp, Check,
  RefreshCw,
} from "lucide-react"
import { Empty } from "../../../components/ui-kit"
import { RoomNotesPanel } from "./room-notes-panel"
import { markerStyle, computeElapsedMs } from "./recording-shared"
import { ChecklistPanel } from "./checklist-panel"
import { setChecklistItemAction, startTimerAction } from "./actions"
import { deriveChecklistModel } from "@/lib/recording-v2/preflight-checklist"
import { CompactClock } from "./cockpit-clock"
import { ENERGY_BAND_LABEL_AR, energyBand } from "@/lib/recording-v2/energy"
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
            {formatClock(m.net_recording_ms)}
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
  const { room, updateEnergy, energyDecision } = useRoomState()
  const prep = initial.preparation.prep_v2
  const isDirector = role === "director"
  const isPhotographer = role === "photographer"
  const isEditor = role === "editor"

  const status0 = room?.status ?? initial.room.status
  const takeNumber = room?.take_number ?? initial.room.take_number

  // ── The director's pre-shoot checklist ────────────────────────────
  //
  // Shown BEFORE the take, to the director, on the director's own surface — the
  // host never sees the 17 rows, only the gate's summary. This is the whole
  // reason the checklist lives here and not in PreflightView: PreflightView is
  // inside LiveV2Client, which only the host (or an operator before the join
  // resolves) ever renders.
  const { checklist: liveChecklist, takeNumber: liveChecklistTake } = useRoomChecklist()
  const { status: connStatus, reconnect } = useRoomConnection()
  // Both sources take-matched; an unmatched source yields EMPTY, never the other
  // one. `initial.room.checklist` is a frozen server-render prop, so after a
  // reset it still holds the scrapped take's rows.
  const checklistModel = useMemo(() => {
    const entries =
      liveChecklist && liveChecklistTake === takeNumber
        ? liveChecklist
        : initial.room.take_number === takeNumber
          ? initial.room.checklist
          : []
    return deriveChecklistModel(entries)
  }, [
    liveChecklist,
    liveChecklistTake,
    takeNumber,
    initial.room.checklist,
    initial.room.take_number,
  ])
  const [busy, setBusy] = useState(false)

  async function onStartTake() {
    setBusy(true)
    try {
      // No optimistic flip here: the room's own `room_update` broadcast (added
      // to every timer action) is what moves this screen off the checklist, so
      // both operators see the take start from the same event.
      await startTimerAction(initial.room.id)
    } finally {
      setBusy(false)
    }
  }

  async function onSetChecklistItem(
    itemKey: string,
    state: "done" | "not_applicable" | "pending",
    reason?: string,
  ) {
    setBusy(true)
    try {
      await setChecklistItemAction({
        roomId: initial.room.id,
        itemKey,
        state,
        notApplicableReason: reason ?? null,
      })
    } finally {
      setBusy(false)
    }
  }

  // Before the take starts, the checklist IS the director's screen — nothing
  // else on it matters until the studio is confirmed. Once recording begins the
  // normal follow-along takes over.
  if (isDirector && status0 === "waiting") {
    return (
      <>
        {/* The director owns the taps, so a dead stream matters MORE here than on
            the host's screen: their confirmations would stop reaching anyone.
            The host had a reconnect control and the director did not. */}
        {connStatus !== "connected" && (
          <div className="mx-auto mt-3 max-w-2xl px-4">
            {/* "Connecting" is every page load and resolves on its own, so it
                gets the quiet neutral treatment. Only a genuinely dead stream
                earns the amber alarm — sharing one amber box for both made a
                normal load look like a fault. */}
            <div
              className={cn(
                "flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-3 py-2.5",
                connStatus === "disconnected"
                  ? "border-amber-500/40 bg-amber-500/10"
                  : "border-border/40 bg-background/50",
              )}
            >
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 text-[12px] font-medium",
                  connStatus === "disconnected" ? "text-amber-800" : "text-muted-foreground",
                )}
              >
                {connStatus === "disconnected" ? (
                  "الاتصال مقطوع — تأكيداتك ما توصل المقدم"
                ) : (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    جارٍ الاتصال… ثانية وتبيّن
                  </>
                )}
              </span>
              {connStatus === "disconnected" && (
                <button
                  type="button"
                  onClick={reconnect}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-amber-500/50 bg-background/60 px-3.5 py-2 text-[12.5px] font-semibold text-amber-800"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> إعادة الاتصال
                </button>
              )}
            </div>
          </div>
        )}
        <ChecklistPanel
          model={checklistModel}
          onSet={onSetChecklistItem}
          busy={busy}
          previousTakeWasComplete={initial.room.checklist_previous_take_complete}
          takeNumber={takeNumber}
          /**
           * The director starts the take too.
           *
           * He is the one standing at the camera, and he was the one person who
           * could see 17/17 confirmed and still had to shout across the studio
           * for someone else to press the button. Same lock (`model.isComplete`
           * inside the panel), no override path, and `startTimer` enforces
           * first-press-wins server-side — the loser of a simultaneous press is
           * simply carried into the live view.
           */
          onStart={onStartTake}
        />
      </>
    )
  }

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

      {/* Director: the clock. He had NONE — not a single one — while being the
          person who calls "we're at forty minutes". Same net time as the host,
          same size, so the two of them are never reading different numbers at
          each other across the studio. */}
      {isDirector && (
        <DirectorClock
          status={status}
          elapsedMsAtBaseline={room?.recording_elapsed_ms ?? initial.room.recording_elapsed_ms}
          recordingStartedAt={room?.recording_started_at ?? initial.room.recording_started_at}
          recordingPausedAt={room?.recording_paused_at ?? initial.room.recording_paused_at}
          sectionIndex={idx}
          sectionLabel={SECTION_LABEL_AR[section.kind] ?? section.kind}
        />
      )}

      {/* Director: propose the room energy — a cue to the host, not a command */}
      {isDirector && (
        <DirectorEnergyControl
          energy={room?.energy_level ?? initial.room.energy_level ?? 3}
          onSet={updateEnergy}
          decision={energyDecision}
          live={status === "live" || status === "paused"}
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

/**
 * The director's clock — the one thing his screen simply did not have.
 *
 * It shows the SAME net recording time as the host, from the same room row and
 * through the same `<CompactClock>`, at the same size. That is deliberate: the
 * two of them call times at each other across a studio, and two clocks that
 * disagree by even a pause's worth of drift is how a take gets ruined.
 *
 * Underneath, smaller, the time in the CURRENT SECTION — stamped locally the
 * moment `current_section_index` changes over SSE. It is NOT called "camera
 * time": `camera_offset_ms` is usually zero and uncalibrated, and labelling an
 * uncalibrated number as camera time is worse than not showing it.
 */
function DirectorClock({
  status,
  elapsedMsAtBaseline,
  recordingStartedAt,
  recordingPausedAt,
  sectionIndex,
  sectionLabel,
}: {
  status: string
  elapsedMsAtBaseline: number
  recordingStartedAt: string | null
  recordingPausedAt: string | null
  sectionIndex: number
  sectionLabel: string
}) {
  const live = status === "live"
  const windowStartedAt =
    recordingStartedAt && !recordingPausedAt ? Date.parse(recordingStartedAt) : null
  const netNow = () => computeElapsedMs(elapsedMsAtBaseline, windowStartedAt, live)

  return (
    <div className="rounded-2xl border border-border/40 bg-card/40 p-3" dir="rtl">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
          زمن التسجيل الصافي
        </span>
        <CompactClock
          status={live ? "live" : status === "paused" ? "paused" : "waiting"}
          elapsedMsAtBaseline={elapsedMsAtBaseline}
          windowStartedAt={windowStartedAt}
        />
      </div>
      <SectionClock sectionIndex={sectionIndex} sectionLabel={sectionLabel} netNow={netNow} />
    </div>
  )
}

/**
 * Time inside the current section.
 *
 * The start is stamped client-side when the section index changes, because
 * nothing records it: `setCurrentSection` writes the index and no timestamp,
 * and there is no `section_change` marker type in the taxonomy (adding one
 * means touching the CHECK constraint in scripts/post-schema.sql — a DB change,
 * out of scope here). The consequence is honest and bounded: a director who
 * joins mid-section sees "—" until the next section starts, rather than a
 * number that would be a guess.
 *
 * Ticks from an interval, never a synchronous set inside the effect, so it
 * costs one cheap re-render of this leaf twice a second and nothing above it.
 */
function SectionClock({
  sectionIndex,
  sectionLabel,
  netNow,
}: {
  sectionIndex: number
  sectionLabel: string
  netNow: () => number
}) {
  const [elapsed, setElapsed] = useState<number | null>(null)
  const startRef = useRef<{ index: number; net: number; observed: boolean } | null>(null)

  useEffect(() => {
    const id = setInterval(() => {
      const now = netNow()
      const s = startRef.current
      if (!s) {
        // First sighting. The section was already running when we arrived and
        // nothing records when it began, so we do not know its age — and we do
        // not start counting from the moment we happened to load. That printed
        // "0:17" for a section twenty minutes old, to the one person in the room
        // who calls the times out loud.
        startRef.current = { index: sectionIndex, net: now, observed: false }
        setElapsed(null)
        return
      }
      if (s.index !== sectionIndex) {
        // We WATCHED this one start. Now the number is earned.
        startRef.current = { index: sectionIndex, net: now, observed: true }
        setElapsed(0)
        return
      }
      setElapsed(s.observed ? Math.max(0, now - s.net) : null)
    }, 500)
    return () => clearInterval(id)
  }, [sectionIndex, netNow])

  return (
    <div className="mt-1 flex items-baseline justify-between gap-2">
      <span className="text-[10.5px] text-muted-foreground">
        في «{sectionLabel}»
        {elapsed == null && <span className="ms-1">· بدأ قبل دخولك</span>}
      </span>
      <span className="font-mono text-[13px] tabular-nums text-foreground/80" dir="ltr">
        {elapsed == null ? "—" : formatClock(elapsed)}
      </span>
    </div>
  )
}

/**
 * The director PROPOSES the room energy; the host disposes.
 *
 * It used to change it outright and in silence, which re-sorted the host's
 * question list under his eyes while he was reading from it. Now the tap still
 * moves the shared value instantly (the host must see the cue, and it is still
 * recorded as an `energy_change` marker) — but the host's question ORDER does
 * not move until he approves. The status line below is the receipt: without it
 * the director taps the same cue again and again, assuming it never landed.
 *
 * Targets are ≥44px and the panel is sticky while a take is running: at 28px it
 * was a thumb-miss on a tablet, and it scrolled off exactly when it was needed.
 */
function DirectorEnergyControl({
  energy,
  onSet,
  decision,
  live,
}: {
  energy: number
  onSet: (level: number) => void
  decision: { decision: string; level: number; approved: number; muted: boolean; seq: number } | null
  live: boolean
}) {
  const [pending, setPending] = useState(false)
  /** The cue we are waiting on, tagged with the decision counter at send time. */
  const [awaiting, setAwaiting] = useState<{ level: number; seq: number } | null>(null)

  const set = async (level: number) => {
    const clamped = Math.max(0, Math.min(5, level))
    if (clamped === energy || pending) return
    setPending(true)
    setAwaiting({ level: clamped, seq: decision?.seq ?? 0 })
    try {
      await onSet(clamped)
    } finally {
      setPending(false)
    }
  }

  // Derived, not stored: a decision counts only if it arrived AFTER our cue.
  const answered = awaiting && decision && decision.seq > awaiting.seq ? decision : null
  /**
   * The channel is closed until told otherwise. Derived from the LATEST verdict,
   * because that is the only thing that changes it: two lapses in a row close
   * it, and the host touching his dial (or a new take) re-opens it.
   *
   * Without this the line kept reading "معلّق… ينتظر موافقته" for five measured
   * minutes after the host had stopped receiving anything at all — a status line
   * asserting the opposite of the truth, which is worse than none.
   */
  const silenced = decision?.muted === true

  return (
    <div className="sticky top-2 z-30 rounded-2xl border border-amber-500/25 bg-card/95 p-3 shadow-sm backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700">
          <Zap className="h-3 w-3" /> طاقة الغرفة · {ENERGY_BAND_LABEL_AR[energyBand(energy)]}
        </span>
        <span className="text-[10.5px] tabular-nums text-muted-foreground" dir="ltr">
          {energy}/5
        </span>
      </div>
      {/*
        Fits a 375px phone. Seven targets at a hard 44px wide plus gap-2 needed
        356px inside a 319px card, so «خفّض الطاقة» was sliced off at the edge —
        on the one control a director uses one-handed in the dark.

        Height is the dimension that decides whether a thumb lands, so all seven
        keep h-11 (44px); the five numbers give up their fixed WIDTH and share
        the row instead (`flex-1 min-w-0`, ~39px each at 375px, growing on any
        larger screen). The chevrons stay square because they are the two
        one-step nudges and are hit without looking.
      */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => void set(energy - 1)}
          disabled={pending || energy <= 0}
          aria-label="خفّض الطاقة"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/60 text-muted-foreground transition hover:bg-muted/40 disabled:opacity-40 [touch-action:manipulation]"
        >
          <ChevronDown className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => void set(n)}
              disabled={pending}
              aria-label={`ضبط الطاقة على ${n}`}
              className={cn(
                "h-11 min-w-0 flex-1 rounded-xl border text-[13px] font-semibold transition disabled:opacity-50 [touch-action:manipulation]",
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
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/60 text-muted-foreground transition hover:bg-muted/40 disabled:opacity-40 [touch-action:manipulation]"
        >
          <ChevronUp className="h-5 w-5" />
        </button>
      </div>

      {/* The receipt. Silence here is what made the same cue get tapped four
          times: the director could not tell "not seen" from "seen and refused". */}
      <p className="mt-2 min-h-[16px] text-[11px]">
        {!live ? (
          <span className="text-muted-foreground">يبدأ الأثر على ترتيب أسئلة المقدم بعد بدء التسجيل.</span>
        ) : silenced ? (
          // Checked BEFORE "معلّق…": while the channel is closed nothing is
          // waiting on the host, so claiming otherwise is the lie itself.
          <span className="text-amber-700">
            توقّف الإشعار لبقية التيك — المقدم ما تفاعل مرّتين. القيمة توصله، والترتيب بيده.
          </span>
        ) : answered ? (
          answered.decision === "approved" ? (
            <span className="font-medium text-emerald-700">وافق المقدم ✓ — الترتيب تحدّث</span>
          ) : answered.decision === "overridden" ? (
            <span className="text-muted-foreground">
              المقدم ضبطها بنفسه على {answered.level}/5
            </span>
          ) : answered.decision === "unmuted" ? (
            <span className="text-emerald-700">رجع الإشعار — تقدر تقترح من جديد</span>
          ) : (
            <span className="text-amber-700">ما تفاعل المقدم — الاقتراح سقط</span>
          )
        ) : awaiting ? (
          <span className="text-muted-foreground">معلّق… وصلت المقدم، ينتظر موافقته</span>
        ) : (
          <span className="text-muted-foreground">
            القيمة توصل المقدم فوراً؛ ترتيب أسئلته ما يتغيّر إلا بموافقته.
          </span>
        )}
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
      {/* One vocabulary for the three grades across every screen in the room. */}
      <span className="font-medium text-amber-700">{ENERGY_BAND_LABEL_AR[energyBand(n)]}</span>
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

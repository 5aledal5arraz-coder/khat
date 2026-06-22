"use client"

/**
 * Phase X Step 5 — Live Recording V2 client surface.
 *
 * Owns:
 *   - section navigation transitions
 *   - debounced director-notes autosave
 *   - quick-tag dispatch + question-completion toggles
 *
 * The high-frequency timer + timeline live in <RecordingClock>, which
 * self-ticks via requestAnimationFrame so the rest of this cockpit does NOT
 * re-render every frame. This component only holds the infrequently-changing
 * timer baseline (elapsedMsAtBaseline + windowStartedAt) and derives the
 * current elapsed on demand when banking a pause/end or stamping a marker.
 *
 * All persistence flows through the server actions in actions.ts.
 */

import { useMemo, useRef, useState, useTransition } from "react"
import { Empty } from "../../../components/ui-kit"
import { ChevronLeft, ChevronRight, Check, Circle, Download, Zap } from "lucide-react"
import { useRoomState, useRoomMarkers } from "@/app/admin/preparation/[id]/room/contexts"
import type { LiveV2Marker, LiveV2Snapshot } from "@/lib/recording-v2/load"
import {
  energyBand,
  rankQuestionsByEnergy,
  matchesEnergy,
  coachHint,
  SECTION_TARGET_LEVEL,
  type EnergyBand,
} from "@/lib/recording-v2/energy"
import {
  QUICK_MARKER_GROUPS,
  QUICK_MARKER_META,
  type QuickMarkerType,
} from "@/lib/recording-v2/marker-types"
import {
  startTimerAction,
  pauseTimerAction,
  resumeTimerAction,
  resetTimerAction,
  endTimerAction,
  setCurrentSectionAction,
  saveDirectorNotesAction,
  createMarkerAction,
  toggleQuestionDoneAction,
} from "./actions"
import type { SectionKind, PrepV2Question } from "@/lib/preparation/v2/types"
import { RecordingClock } from "./recording-clock"
import {
  SECTION_LABEL_AR,
  markerStyle,
  formatPrecise,
  nowMs,
  computeElapsedMs,
} from "./recording-shared"

const TYPE_LABEL_AR: Record<string, string> = {
  emotional: "عاطفي",
  philosophical: "فلسفي",
  personal: "شخصي",
  confrontational: "مواجهة",
  reflective: "تأملي",
  factual: "سياقي",
}

export function LiveV2Client({ initial }: { initial: LiveV2Snapshot }) {
  const room = initial.room
  const prep = initial.preparation
  const sections = prep.prep_v2?.episode_sections ?? null

  // ── Live energy (set by the director / host, synced over SSE) ──────
  const { room: liveRoom } = useRoomState()
  const energy = liveRoom?.energy_level ?? room.energy_level ?? 3
  const band = energyBand(energy)

  // Energy ribbon — built reactively from the room's energy_change markers
  // (recorded server-side on every change, delivered live over SSE).
  const { markers: sessionMarkers } = useRoomMarkers()
  const energyHistory = useMemo(
    () =>
      sessionMarkers
        .filter((m) => m.marker_type === "energy_change")
        .map((m) => ({
          recording_ms: m.recording_ms,
          level: Math.max(0, Math.min(5, Number(m.note) || 3)),
        }))
        .sort((a, b) => a.recording_ms - b.recording_ms),
    [sessionMarkers],
  )

  // ── Timer baseline (changes only on start/pause/resume/reset/end) ──
  const [status, setStatus] = useState<typeof room.status>(room.status)
  const [elapsedMsAtBaseline, setElapsedMsAtBaseline] = useState<number>(
    room.recording_elapsed_ms,
  )
  const [windowStartedAt, setWindowStartedAt] = useState<number | null>(
    room.recording_started_at && !room.recording_paused_at
      ? Date.parse(room.recording_started_at)
      : null,
  )

  /** Current elapsed ms, derived on demand (no per-frame state here). */
  function nowElapsed(): number {
    return computeElapsedMs(elapsedMsAtBaseline, windowStartedAt, status === "live")
  }

  // ── Section index ─────────────────────────────────────────────────
  const [sectionIndex, setSectionIndex] = useState<number>(
    room.current_section_index ?? 0,
  )
  const currentSection: SectionKind | null = sections
    ? (sections[sectionIndex]?.kind ?? null)
    : null
  const [completedSections, setCompletedSections] = useState<Set<number>>(
    new Set(Array.from({ length: sectionIndex }, (_, i) => i)),
  )

  // ── Question completion (persisted + SSE-synced via the room row) ──
  const [completedQuestionIds, setCompletedQuestionIds] = useState<Set<string>>(
    new Set(room.completed_question_ids ?? []),
  )
  async function toggleQuestionDone(questionId: string) {
    const flip = (s: Set<string>) => {
      const next = new Set(s)
      if (next.has(questionId)) next.delete(questionId)
      else next.add(questionId)
      return next
    }
    setCompletedQuestionIds(flip) // optimistic
    try {
      const r = await toggleQuestionDoneAction({ roomId: room.id, questionId })
      if (r.ok) setCompletedQuestionIds(new Set(r.completed)) // reconcile to server truth
      else setCompletedQuestionIds(flip) // server rejected → revert
    } catch {
      setCompletedQuestionIds(flip) // network/error → revert
    }
  }

  // ── Notes ─────────────────────────────────────────────────────────
  const [notes, setNotes] = useState(room.director_notes)
  const [, startNotesTransition] = useTransition()
  const noteSaveTimer = useRef<NodeJS.Timeout | null>(null)
  function onNotesChange(value: string) {
    setNotes(value)
    if (noteSaveTimer.current) clearTimeout(noteSaveTimer.current)
    noteSaveTimer.current = setTimeout(() => {
      startNotesTransition(async () => {
        await saveDirectorNotesAction({ roomId: room.id, notes: value })
      })
    }, 750)
  }

  // ── Markers (latest-first) ────────────────────────────────────────
  const [markers, setMarkers] = useState<LiveV2Marker[]>(initial.markers)

  // ── Timer actions ─────────────────────────────────────────────────
  const [busy, startTransition] = useTransition()
  function withBusy(fn: () => Promise<void>) {
    return () => startTransition(fn)
  }

  const onStart = withBusy(async () => {
    await startTimerAction(room.id)
    setElapsedMsAtBaseline(0)
    setWindowStartedAt(nowMs())
    setStatus("live")
  })
  const onPause = withBusy(async () => {
    setElapsedMsAtBaseline(nowElapsed()) // optimistic instant freeze
    setWindowStartedAt(null)
    setStatus("paused")
    const r = await pauseTimerAction(room.id)
    if (r.ok && typeof r.elapsed_ms === "number") setElapsedMsAtBaseline(r.elapsed_ms)
  })
  const onResume = withBusy(async () => {
    await resumeTimerAction(room.id)
    setWindowStartedAt(nowMs())
    setStatus("live")
  })
  const onReset = withBusy(async () => {
    await resetTimerAction(room.id)
    setElapsedMsAtBaseline(0)
    setWindowStartedAt(null)
    setStatus("waiting")
  })
  const onEnd = withBusy(async () => {
    setElapsedMsAtBaseline(nowElapsed()) // optimistic instant freeze
    setWindowStartedAt(null)
    setStatus("ended")
    const r = await endTimerAction(room.id)
    if (r.ok && typeof r.elapsed_ms === "number") setElapsedMsAtBaseline(r.elapsed_ms)
  })

  // ── Flow actions ─────────────────────────────────────────────────
  async function moveTo(idx: number) {
    if (!sections) return
    const clamped = Math.max(0, Math.min(sections.length - 1, idx))
    setSectionIndex(clamped)
    await setCurrentSectionAction({
      roomId: room.id,
      index: clamped,
      key: sections[clamped].kind,
    })
  }
  function toggleCompleted(idx: number) {
    setCompletedSections((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  // ── Marker dispatch ──────────────────────────────────────────────
  async function tag(type: QuickMarkerType, label: string) {
    const fallbackMs = nowElapsed()
    const r = await createMarkerAction({
      roomId: room.id,
      markerType: type,
      label,
      sectionKey: currentSection,
    })
    if (r.ok) {
      setMarkers((prev) => [
        {
          id: r.marker_id ?? crypto.randomUUID(),
          marker_type: type,
          label,
          note: null,
          recording_ms: r.recording_ms ?? fallbackMs,
          section_key: currentSection,
          created_at: new Date().toISOString(),
          author_name: "you",
        },
        ...prev,
      ])
    }
  }

  // ── Section question list — ranked by energy fit (must_ask still first,
  //    energy-matching questions float up, done sinks) ───────────────
  const currentSectionQuestions: PrepV2Question[] = useMemo(() => {
    if (!prep.prep_v2 || !currentSection) return []
    const all = prep.prep_v2.question_bank.filter(
      (q) => q.section === currentSection,
    )
    return rankQuestionsByEnergy(all, band, (id) => completedQuestionIds.has(id))
  }, [prep.prep_v2, currentSection, band, completedQuestionIds])

  // Live coaching whisper when energy is in tension with the section's arc.
  const hint = coachHint(currentSection, energy)

  // Energy markers drive the ribbon, not the content pins / count / list.
  const contentMarkers = markers.filter((m) => m.marker_type !== "energy_change")

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      {/* ── Hero: big centered timer + timeline ──────────────────── */}
      <RecordingClock
        status={status}
        elapsedMsAtBaseline={elapsedMsAtBaseline}
        windowStartedAt={windowStartedAt}
        busy={busy}
        onStart={onStart}
        onPause={onPause}
        onResume={onResume}
        onReset={onReset}
        onEnd={onEnd}
        sections={sections}
        markers={contentMarkers}
        energyHistory={energyHistory}
        currentSectionIndex={sectionIndex}
      />

      {/* ── Live coaching whisper: energy ↔ section tension ──────── */}
      {hint && <CoachHintBanner hint={hint} energy={energy} section={currentSection} />}

      {/* ── Session-ended: export all markers as CSV ─────────────── */}
      {status === "ended" && (
        <SessionEndedExport roomId={room.id} markerCount={contentMarkers.length} />
      )}

      {/* ── Quick markers — directly under the timeline so they're the
          easiest thing to reach during a take (tap → pin lands on the
          timeline right above). The most time-critical action. ───────── */}
      <QuickTagsPanel onTag={tag} disabled={status === "waiting"} markers={contentMarkers} />

      {/* ── Compact episode/status strip ─────────────────────────── */}
      <RoomStatusPanel
        status={status}
        eirPhase={room.eir_phase}
        markers={contentMarkers.length}
        guestName={prep.guest_name}
        title={prep.title}
      />

      {/* ── Flow tracker ─────────────────────────────────────────── */}
      {sections ? (
        <FlowTracker
          sections={sections}
          currentIndex={sectionIndex}
          completed={completedSections}
          onSelect={moveTo}
          onToggleCompleted={toggleCompleted}
        />
      ) : (
        <div className="rounded-2xl border border-border/40 bg-background/40 p-4 text-[12px] text-muted-foreground">
          لا توجد بنية Prep V2 لهذا الإعداد — يتم عرض الأسئلة القديمة مباشرة أدناه.
        </div>
      )}

      {/* ── Section questions (full width) ───────────────────────── */}
      <SectionQuestions
        legacy={!prep.prep_v2}
        legacyQuestions={prep.legacy_questions}
        currentSection={currentSection}
        questions={currentSectionQuestions}
        completedIds={completedQuestionIds}
        onToggleDone={toggleQuestionDone}
        band={band}
      />

      {/* ── Director notes ───────────────────────────────────────── */}
      <DirectorNotesPanel value={notes} onChange={onNotesChange} />
    </div>
  )
}

// ─── CoachHintBanner ──────────────────────────────────────────────────

function CoachHintBanner({
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
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5">
      <span className="inline-flex items-center gap-2 text-[13px] font-medium text-amber-700">
        <Zap className="h-4 w-4 shrink-0 text-amber-600" />
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

// ─── SessionEndedExport ───────────────────────────────────────────────

function SessionEndedExport({
  roomId,
  markerCount,
}: {
  roomId: string
  markerCount: number
}) {
  const hasMarkers = markerCount > 0
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
      <div>
        <div className="text-[13px] font-semibold text-emerald-700">انتهى التسجيل</div>
        <div className="text-[11.5px] text-muted-foreground">
          {hasMarkers
            ? `${markerCount} علامة جاهزة للتصدير`
            : "لا توجد علامات لتصديرها"}
        </div>
      </div>
      <a
        href={`/api/admin/recording/${roomId}/markers/export`}
        aria-disabled={!hasMarkers}
        className={
          "inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-[13px] font-semibold text-emerald-700 transition hover:bg-emerald-500/20 " +
          (hasMarkers ? "" : "pointer-events-none opacity-40")
        }
      >
        <Download className="h-4 w-4" /> تصدير العلامات (CSV)
      </a>
    </div>
  )
}

// ─── RoomStatusPanel (compact strip) ──────────────────────────────────

function RoomStatusPanel(props: {
  status: string
  eirPhase: string | null
  markers: number
  guestName: string | null
  title: string
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/40 bg-background/40 px-4 py-3">
      <div className="min-w-0">
        <div className="truncate text-[14px] font-semibold leading-tight">{props.title}</div>
        {props.guestName && (
          <div className="text-[11.5px] text-muted-foreground">ضيف: {props.guestName}</div>
        )}
      </div>
      <div className="flex gap-2">
        <Stat label="حالة" value={props.status} />
        <Stat label="EIR" value={props.eirPhase ?? "—"} />
        <Stat label="علامات" value={String(props.markers)} />
      </div>
    </div>
  )
}

// ─── FlowTracker ──────────────────────────────────────────────────────

function FlowTracker(props: {
  sections: NonNullable<LiveV2Snapshot["preparation"]["prep_v2"]>["episode_sections"]
  currentIndex: number
  completed: Set<number>
  onSelect: (idx: number) => void
  onToggleCompleted: (idx: number) => void
}) {
  return (
    <div className="rounded-2xl border border-border/40 bg-background/40 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
          هيكل الحلقة
        </div>
        <div className="flex gap-1.5">
          <IconBtn
            icon={<ChevronRight />}
            onClick={() => props.onSelect(props.currentIndex - 1)}
            disabled={props.currentIndex <= 0}
            label="السابق"
          />
          <IconBtn
            icon={<ChevronLeft />}
            onClick={() => props.onSelect(props.currentIndex + 1)}
            disabled={props.currentIndex >= props.sections.length - 1}
            label="التالي"
          />
        </div>
      </div>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {props.sections.map((s, i) => {
          const state =
            i === props.currentIndex
              ? "current"
              : props.completed.has(i)
                ? "completed"
                : "upcoming"
          return (
            <li
              key={s.kind}
              className={
                "rounded-xl border p-2.5 " +
                (state === "current"
                  ? "border-violet-500/40 bg-violet-500/10"
                  : state === "completed"
                    ? "border-emerald-500/30 bg-emerald-500/10 opacity-80"
                    : "border-border/40 bg-background/30")
              }
            >
              <button
                type="button"
                onClick={() => props.onSelect(i)}
                className="block w-full text-start"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11.5px] font-semibold">
                    {SECTION_LABEL_AR[s.kind] ?? s.kind}
                  </span>
                  <span
                    className="text-[10px] tabular-nums text-muted-foreground"
                    dir="ltr"
                  >
                    {s.estimated_minutes}m
                  </span>
                </div>
                <div className="mt-1 line-clamp-2 text-[10.5px] leading-snug text-muted-foreground/85">
                  {s.target_emotion} · {s.intent.slice(0, 80)}
                </div>
              </button>
              <button
                type="button"
                onClick={() => props.onToggleCompleted(i)}
                className="mt-2 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
              >
                <Check className="h-2.5 w-2.5" />
                {props.completed.has(i) ? "مكتمل" : "تحديد كمكتمل"}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// ─── SectionQuestions ─────────────────────────────────────────────────

function SectionQuestions(props: {
  legacy: boolean
  legacyQuestions: string[]
  currentSection: SectionKind | null
  questions: PrepV2Question[]
  completedIds: Set<string>
  onToggleDone: (id: string) => void
  band: EnergyBand
}) {
  if (props.legacy) {
    return (
      <div className="rounded-2xl border border-border/40 bg-background/40 p-4">
        <div className="mb-2 text-[10.5px] uppercase tracking-wider text-muted-foreground">
          أسئلة (نسخة قديمة)
        </div>
        {props.legacyQuestions.length === 0 ? (
          <Empty text="لا توجد أسئلة قديمة لهذا الإعداد." />
        ) : (
          <ul className="space-y-2">
            {props.legacyQuestions.map((q, i) => (
              <li
                key={i}
                className="rounded-xl border border-border/40 bg-background/30 p-3 text-[14px] leading-relaxed"
              >
                {q}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }
  const doneCount = props.questions.filter((q) => props.completedIds.has(q.id)).length
  return (
    <div className="rounded-2xl border border-border/40 bg-background/40 p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
          أسئلة القسم
        </div>
        <div className="flex items-center gap-2 text-[10.5px] text-muted-foreground">
          {props.questions.length > 0 && (
            <span className="tabular-nums" dir="ltr">
              {doneCount}/{props.questions.length}
            </span>
          )}
          <span>
            {props.currentSection
              ? SECTION_LABEL_AR[props.currentSection] ?? props.currentSection
              : "—"}
          </span>
        </div>
      </div>
      {props.questions.length === 0 ? (
        <Empty text="لا توجد أسئلة في هذا القسم." />
      ) : (
        <ul className="space-y-3">
          {props.questions.map((q) => {
            const done = props.completedIds.has(q.id)
            return (
              <li
                key={q.id}
                className={
                  "rounded-xl border p-3 transition " +
                  (done
                    ? "border-emerald-500/40 bg-emerald-500/5 opacity-70"
                    : q.priority === "must_ask"
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-border/40 bg-background/30")
                }
              >
                <div className="flex items-start gap-2.5">
                  <button
                    type="button"
                    onClick={() => props.onToggleDone(q.id)}
                    aria-pressed={done}
                    title={done ? "تراجع عن الإكمال" : "تحديد كمطروح"}
                    className={
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition " +
                      (done
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-border/60 text-transparent hover:border-emerald-500/60")
                    }
                  >
                    {done ? <Check className="h-3 w-3" /> : <Circle className="h-2 w-2" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <PriorityChip priority={q.priority} />
                      {q.types.map((t) => (
                        <span
                          key={t}
                          className="rounded-full border border-border/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {TYPE_LABEL_AR[t] ?? t}
                        </span>
                      ))}
                      <RiskChip risk={q.risk_level} />
                      {!done && matchesEnergy(q, props.band) && (
                        <span
                          title="يناسب الطاقة الحالية"
                          className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                        >
                          <Zap className="h-2.5 w-2.5" /> يناسب الطاقة
                        </span>
                      )}
                      {done && (
                        <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                          تم طرحه
                        </span>
                      )}
                    </div>
                    <div
                      className={
                        "text-[16px] font-medium leading-snug " +
                        (done ? "text-muted-foreground line-through" : "text-foreground")
                      }
                    >
                      {q.text}
                    </div>
                    {q.purpose && !done && (
                      <div className="mt-1 text-[12px] text-muted-foreground/85">
                        {q.purpose}
                      </div>
                    )}
                    {q.follow_up_prompt && !done && (
                      <div className="mt-1 text-[12px] text-foreground/75">
                        ↳ {q.follow_up_prompt}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ─── QuickTagsPanel ───────────────────────────────────────────────────

function QuickTagsPanel(props: {
  onTag: (type: QuickMarkerType, label: string) => void
  disabled?: boolean
  markers: LiveV2Marker[]
}) {
  return (
    <div className="rounded-2xl border border-border/40 bg-background/40 p-4">
      <div className="mb-3 text-[10.5px] uppercase tracking-wider text-muted-foreground">
        علامات سريعة
      </div>

      {/* The 3 groups sit side by side on wide screens (a marker toolbar
          under the timeline); they stack on narrow screens. */}
      <div className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-3">
        {QUICK_MARKER_GROUPS.map((group) => (
          <div key={group.key}>
            <div className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {group.types.map((type) => {
                const st = markerStyle(type)
                const meta = QUICK_MARKER_META[type]
                const Icon = st.icon
                return (
                  <button
                    key={type}
                    type="button"
                    disabled={props.disabled}
                    onClick={() => props.onTag(type, meta.defaultLabel)}
                    title={meta.hint}
                    className="flex flex-col items-center justify-center gap-1 rounded-xl border border-border/40 bg-background/50 px-1.5 py-2 text-[10.5px] font-medium text-foreground/85 transition hover:border-border/70 hover:bg-background/80 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Icon className={"h-4 w-4 " + st.text} />
                    <span className="leading-tight text-center">{meta.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Recent markers — compact horizontal chips so the panel stays short. */}
      {props.markers.length > 0 && (
        <div className="mt-4 border-t border-border/30 pt-3">
          <div className="mb-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">
            آخر العلامات
          </div>
          <div className="flex flex-wrap gap-1.5">
            {props.markers.slice(0, 12).map((m) => {
              const st = markerStyle(m.marker_type)
              const Icon = st.icon
              return (
                <span
                  key={m.id}
                  className={"inline-flex items-center gap-1.5 rounded-full border border-border/40 px-2 py-1 text-[10.5px] " + st.soft}
                >
                  <Icon className={"h-3 w-3 " + st.text} />
                  <span className={"font-medium " + st.text}>{st.label}</span>
                  <span className="font-mono text-foreground/70 tabular-nums" dir="ltr">
                    {formatPrecise(m.recording_ms)}
                  </span>
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── DirectorNotesPanel ───────────────────────────────────────────────

function DirectorNotesPanel(props: {
  value: string
  onChange: (s: string) => void
}) {
  return (
    <div className="rounded-2xl border border-border/40 bg-background/40 p-4">
      <div className="mb-2 text-[10.5px] uppercase tracking-wider text-muted-foreground">
        ملاحظات المخرج
      </div>
      <textarea
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder="اكتب ملاحظاتك هنا. يحفظ تلقائياً."
        className="min-h-[120px] w-full resize-y rounded-xl border border-border/40 bg-background/40 p-3 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:border-violet-500/40 focus:outline-none"
      />
    </div>
  )
}

// ─── Subcomponents ────────────────────────────────────────────────────

function IconBtn(props: {
  icon: React.ReactNode
  onClick: () => void
  disabled?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.label}
      className="rounded-lg border border-border/50 p-1.5 text-muted-foreground hover:bg-background/60 disabled:opacity-40"
    >
      <span className="block h-3 w-3">{props.icon}</span>
    </button>
  )
}

function PriorityChip({ priority }: { priority: "must_ask" | "if_time" }) {
  if (priority === "must_ask") {
    return (
      <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
        must_ask
      </span>
    )
  }
  return (
    <span className="rounded-full bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground">
      if_time
    </span>
  )
}

function RiskChip({ risk }: { risk: "low" | "medium" | "high" }) {
  const cls =
    risk === "high"
      ? "bg-rose-500/10 text-rose-700"
      : risk === "medium"
        ? "bg-amber-500/10 text-amber-700"
        : "bg-sky-500/10 text-sky-700"
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${cls}`} dir="ltr">
      risk: {risk}
    </span>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-background/30 px-2.5 py-1.5 text-center">
      <div className="text-[9.5px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-[12.5px] font-semibold tabular-nums" dir="ltr">
        {value}
      </div>
    </div>
  )
}

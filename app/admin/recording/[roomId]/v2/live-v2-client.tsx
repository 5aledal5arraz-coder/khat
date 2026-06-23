"use client"

/**
 * Live Recording V2 — the ORCHESTRATOR.
 *
 * Owns all cockpit state + the server-action handlers (timer transport,
 * section nav, question-done, marker tagging, insight mark-used, debounced
 * notes autosave) and routes them into a PHASE-AWARE view driven by the local
 * optimistic `status`:
 *
 *   waiting        → <PreflightView>   (read the prep, then go live)
 *   live | paused  → <OnAirView>       (the focus deck — the centerpiece)
 *   ended          → <WrapView>        (recap + export)
 *
 * The mode reads the LOCAL `status` the transport mutates (not SSE) so the view
 * flips instantly with the optimistic timer. The high-frequency clock self-ticks
 * inside <CompactClock>/<RecordingClock> via rAF, so a phase view never
 * re-renders per frame. Rooms without a prep_v2 fall back to <LegacyCockpit>.
 *
 * All persistence flows through the server actions in actions.ts.
 */

import { useMemo, useRef, useState, useTransition } from "react"
import { Empty } from "../../../components/ui-kit"
import { useRoomState, useRoomMarkers } from "@/app/admin/preparation/[id]/room/contexts"
import type { LiveV2Marker, LiveV2Snapshot } from "@/lib/recording-v2/load"
import { energyBand, rankQuestionsByEnergy, coachHint } from "@/lib/recording-v2/energy"
import { QUICK_MARKER_GROUPS, QUICK_MARKER_META, type QuickMarkerType } from "@/lib/recording-v2/marker-types"
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
import type { SectionKind, PrepV2Question, PrepV2Insight } from "@/lib/preparation/v2/types"
import { RecordingClock } from "./recording-clock"
import { markerStyle, formatPrecise, nowMs, computeElapsedMs } from "./recording-shared"
import { INSIGHT_META } from "./cockpit-bits"
import { PreflightView } from "./preflight-view"
import { OnAirView } from "./onair-view"
import { WrapView } from "./wrap-view"

export function LiveV2Client({ initial }: { initial: LiveV2Snapshot }) {
  const room = initial.room
  const prep = initial.preparation
  const sections = prep.prep_v2?.episode_sections ?? null

  // ── Live energy (set by the director / host, synced over SSE) ──────
  const { room: liveRoom, updateEnergy } = useRoomState()
  const energy = liveRoom?.energy_level ?? room.energy_level ?? 3
  const band = energyBand(energy)
  const onSetEnergy = (level: number) => void updateEnergy(level)

  // Energy ribbon — built from the room's energy_change markers (recorded
  // server-side on every change, delivered live over SSE).
  const { markers: sessionMarkers } = useRoomMarkers()
  const energyHistory = useMemo(() => {
    const pts = sessionMarkers
      .filter((m) => m.marker_type === "energy_change")
      .map((m) => ({
        recording_ms: m.recording_ms,
        level: Math.max(0, Math.min(5, Number(m.note) || 3)),
      }))
      .sort((a, b) => a.recording_ms - b.recording_ms)
    const byMs = new Map<number, number>()
    for (const p of pts) byMs.set(p.recording_ms, p.level)
    return [...byMs.entries()].map(([recording_ms, level]) => ({ recording_ms, level }))
  }, [sessionMarkers])

  // ── Timer baseline (changes only on start/pause/resume/reset/end) ──
  const [status, setStatus] = useState<typeof room.status>(room.status)
  const [elapsedMsAtBaseline, setElapsedMsAtBaseline] = useState<number>(room.recording_elapsed_ms)
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
  const [sectionIndex, setSectionIndex] = useState<number>(room.current_section_index ?? 0)
  const currentSection: SectionKind | null = sections ? (sections[sectionIndex]?.kind ?? null) : null
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

  // ── Notes (debounced autosave) ────────────────────────────────────
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
    setElapsedMsAtBaseline(nowElapsed())
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
    setElapsedMsAtBaseline(nowElapsed())
    setWindowStartedAt(null)
    setStatus("ended")
    const r = await endTimerAction(room.id)
    if (r.ok && typeof r.elapsed_ms === "number") setElapsedMsAtBaseline(r.elapsed_ms)
  })

  // ── Flow actions ─────────────────────────────────────────────────
  async function moveTo(idx: number) {
    if (!sections) return
    const clamped = Math.max(0, Math.min(sections.length - 1, idx))
    // Mark the section we're leaving as covered as the host advances forward.
    setCompletedSections((prev) => {
      if (clamped <= sectionIndex) return prev
      const next = new Set(prev)
      for (let i = 0; i < clamped; i++) next.add(i)
      return next
    })
    setSectionIndex(clamped)
    await setCurrentSectionAction({ roomId: room.id, index: clamped, key: sections[clamped].kind })
  }

  // ── Marker dispatch ──────────────────────────────────────────────
  async function tag(type: QuickMarkerType, label: string) {
    const fallbackMs = nowElapsed()
    try {
      const r = await createMarkerAction({ roomId: room.id, markerType: type, label, sectionKey: currentSection })
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
    } catch {
      // Best-effort marker — a transient failure shouldn't surface mid-take.
    }
  }

  // ── Insight "used" dispatch → an `insight_used` marker + optimistic flag ──
  const [usedInsightIds, setUsedInsightIds] = useState<Set<string>>(new Set())
  async function tagInsight(insight: PrepV2Insight) {
    if (usedInsightIds.has(insight.id)) return
    setUsedInsightIds((prev) => new Set(prev).add(insight.id))
    const revert = () =>
      setUsedInsightIds((prev) => {
        const next = new Set(prev)
        next.delete(insight.id)
        return next
      })
    const fallbackMs = nowElapsed()
    const note = `${INSIGHT_META[insight.type].label} · ${insight.text}`.slice(0, 180)
    try {
      const r = await createMarkerAction({
        roomId: room.id,
        markerType: "insight_used",
        label: "إسناد",
        note,
        sectionKey: currentSection,
      })
      if (r.ok) {
        setMarkers((prev) => [
          {
            id: r.marker_id ?? crypto.randomUUID(),
            marker_type: "insight_used",
            label: "إسناد",
            note,
            recording_ms: r.recording_ms ?? fallbackMs,
            section_key: currentSection,
            created_at: new Date().toISOString(),
            author_name: "you",
          },
          ...prev,
        ])
      } else {
        revert()
      }
    } catch {
      revert()
    }
  }

  // ── Section question list — ranked by energy fit ──────────────────
  const currentSectionQuestions: PrepV2Question[] = useMemo(() => {
    if (!prep.prep_v2 || !currentSection) return []
    const all = prep.prep_v2.question_bank.filter((q) => q.section === currentSection)
    return rankQuestionsByEnergy(all, band, (id) => completedQuestionIds.has(id))
  }, [prep.prep_v2, currentSection, band, completedQuestionIds])

  const hint = coachHint(currentSection, energy)
  // Energy markers drive the ribbon, not the content pins / count / list.
  const contentMarkers = markers.filter((m) => m.marker_type !== "energy_change")

  // ── Phase routing ─────────────────────────────────────────────────
  const pv = prep.prep_v2
  if (!pv) {
    return (
      <LegacyCockpit
        status={status}
        elapsedMsAtBaseline={elapsedMsAtBaseline}
        windowStartedAt={windowStartedAt}
        busy={busy}
        onStart={onStart}
        onPause={onPause}
        onResume={onResume}
        onReset={onReset}
        onEnd={onEnd}
        contentMarkers={contentMarkers}
        energyHistory={energyHistory}
        sectionIndex={sectionIndex}
        legacyQuestions={prep.legacy_questions}
        onTag={tag}
        notes={notes}
        onNotesChange={onNotesChange}
        roomId={room.id}
      />
    )
  }

  if (status === "waiting") {
    return (
      <PreflightView
        title={prep.title}
        guestName={prep.guest_name}
        thesis={pv.thesis}
        axes={pv.axes_of_tension}
        hostGuidance={pv.host_guidance}
        openingOptions={pv.opening_options}
        sensitiveZones={pv.sensitive_zones}
        sections={pv.episode_sections}
        energy={energy}
        canSetEnergy
        onSetEnergy={onSetEnergy}
        onStart={onStart}
        busy={busy}
      />
    )
  }

  if (status === "ended") {
    return (
      <WrapView
        roomId={room.id}
        durationMs={nowElapsed()}
        sectionsTotal={pv.episode_sections.length}
        sectionsDone={completedSections.size}
        questionsAsked={completedQuestionIds.size}
        questionsTotal={pv.question_bank.length}
        markers={contentMarkers}
        closingOptions={pv.closing_options}
        onReset={onReset}
        busy={busy}
      />
    )
  }

  return (
    <OnAirView
      status={status === "paused" ? "paused" : "live"}
      elapsedMsAtBaseline={elapsedMsAtBaseline}
      windowStartedAt={windowStartedAt}
      busy={busy}
      onPause={onPause}
      onResume={onResume}
      onEnd={onEnd}
      sections={pv.episode_sections}
      sectionIndex={sectionIndex}
      currentSection={currentSection}
      moveTo={moveTo}
      questions={currentSectionQuestions}
      completedIds={completedQuestionIds}
      onToggleDone={toggleQuestionDone}
      band={band}
      usedInsightIds={usedInsightIds}
      onUseInsight={tagInsight}
      energy={energy}
      canSetEnergy
      onSetEnergy={onSetEnergy}
      contentMarkers={contentMarkers}
      energyHistory={energyHistory}
      hint={hint}
      notes={notes}
      onNotesChange={onNotesChange}
      onTag={tag}
    />
  )
}

// ─── Legacy cockpit (rooms with no prep_v2 — a flat question list) ─────

function LegacyCockpit(props: {
  status: "waiting" | "live" | "paused" | "ended"
  elapsedMsAtBaseline: number
  windowStartedAt: number | null
  busy: boolean
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onReset: () => void
  onEnd: () => void
  contentMarkers: LiveV2Marker[]
  energyHistory: { recording_ms: number; level: number }[]
  sectionIndex: number
  legacyQuestions: string[]
  onTag: (type: QuickMarkerType, label: string) => void
  notes: string
  onNotesChange: (s: string) => void
  roomId: string
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <RecordingClock
        status={props.status}
        elapsedMsAtBaseline={props.elapsedMsAtBaseline}
        windowStartedAt={props.windowStartedAt}
        busy={props.busy}
        onStart={props.onStart}
        onPause={props.onPause}
        onResume={props.onResume}
        onReset={props.onReset}
        onEnd={props.onEnd}
        sections={null}
        markers={props.contentMarkers}
        energyHistory={props.energyHistory}
        currentSectionIndex={props.sectionIndex}
      />
      <QuickTagsPanel onTag={props.onTag} disabled={props.status === "waiting"} markers={props.contentMarkers} />
      <div className="rounded-2xl border border-border/40 bg-background/40 p-4">
        <div className="mb-2 text-[10.5px] uppercase tracking-wider text-muted-foreground">أسئلة</div>
        {props.legacyQuestions.length === 0 ? (
          <Empty text="لا توجد أسئلة لهذا الإعداد." />
        ) : (
          <ul className="space-y-2">
            {props.legacyQuestions.map((q, i) => (
              <li key={i} className="rounded-xl border border-border/40 bg-background/30 p-3 text-[14px] leading-relaxed">
                {q}
              </li>
            ))}
          </ul>
        )}
      </div>
      <DirectorNotesPanel value={props.notes} onChange={props.onNotesChange} />
    </div>
  )
}

// ─── QuickTagsPanel (legacy marker grid) ──────────────────────────────

function QuickTagsPanel(props: {
  onTag: (type: QuickMarkerType, label: string) => void
  disabled?: boolean
  markers: LiveV2Marker[]
}) {
  return (
    <div className="rounded-2xl border border-border/40 bg-background/40 p-4">
      <div className="mb-3 text-[10.5px] uppercase tracking-wider text-muted-foreground">علامات سريعة</div>
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
                    <span className="text-center leading-tight">{meta.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      {props.markers.length > 0 && (
        <div className="mt-4 border-t border-border/30 pt-3">
          <div className="mb-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">آخر العلامات</div>
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

function DirectorNotesPanel(props: { value: string; onChange: (s: string) => void }) {
  return (
    <div className="rounded-2xl border border-border/40 bg-background/40 p-4">
      <div className="mb-2 text-[10.5px] uppercase tracking-wider text-muted-foreground">ملاحظات</div>
      <textarea
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder="اكتب ملاحظاتك هنا. يحفظ تلقائياً."
        className="min-h-[120px] w-full resize-y rounded-xl border border-border/40 bg-background/40 p-3 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:border-violet-500/40 focus:outline-none"
      />
    </div>
  )
}

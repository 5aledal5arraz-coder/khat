"use client"

/**
 * Live Recording V2 — the ORCHESTRATOR.
 *
 * Owns all cockpit state + the server-action handlers (timer transport,
 * section nav, question-done, marker tagging, insight mark-used, debounced
 * notes autosave) and routes them into a PHASE-AWARE view:
 *
 *   waiting        → <PreflightView>   (read the prep, then go live)
 *   live | paused  → <OnAirView>       (the focus deck — the centerpiece)
 *   ended          → <WrapView>        (recap + export)
 *
 * ── WHERE THE TRUTH LIVES ──────────────────────────────────────────────────
 * The transport (status + clock baseline), the section and the asked set used
 * to be PRIVATE to this component: set optimistically by the host's own
 * buttons and never read back from the room. So a take the director started
 * never reached the host's screen, a host who then pressed start got
 * `already_started` and a clock set to 0, and a second device drifted forever.
 *
 * Now the shared room row is the truth. Local state is optimistic only while
 * one of the host's own requests is in flight (`pendingOps`); each action
 * returns the row it broadcast and the cockpit adopts it; every later
 * `room_update` is applied as it arrives. A failed action ROLLS BACK instead of
 * leaving the screen claiming a pause the server never recorded.
 *
 * The high-frequency clocks tick inside their own leaves (<CompactClock>,
 * the rail's section timer), so a phase view never re-renders per tick. Rooms
 * without a prep_v2 fall back to <LegacyCockpit>.
 */

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react"
import { Empty } from "../../../components/ui-kit"
import {
  useRoomState,
  useRoomMarkers,
  useRoomChecklist,
  useRoomConnection,
} from "@/app/admin/preparation/[id]/room/contexts"
import type { LiveV2Marker, LiveV2Snapshot } from "@/lib/recording-v2/load"
import type { CollaborationRoom } from "@/types/collaboration"
import { prepFormatOf, sectionLabelAr } from "@/lib/preparation/v2/format"
import {
  energyBand,
  rankQuestionsByEnergy,
  coachHint,
  sectionRespondsToEnergy,
} from "@/lib/recording-v2/energy"
import {
  ENERGY_LAPSE_NOTICE_MS,
  energyHandshake,
  initEnergyHandshake,
  resolveHero,
  type EnergyHandshakeEvent,
  type EnergyHandshakeState,
} from "@/lib/recording-v2/energy-handshake"
import {
  isTypingTarget,
  pinnedQuestionEdited,
  sectionIndexFor,
  shortcutFor,
  shouldApplyRoomRow,
  transportAfterAction,
  transportFromRoom,
  unaskedMustAsk,
  type TransportState,
} from "@/lib/recording-v2/live-sync"
import { QUICK_MARKER_GROUPS, QUICK_MARKER_META, type QuickMarkerType } from "@/lib/recording-v2/marker-types"
import {
  startTimerAction,
  pauseTimerAction,
  resumeTimerAction,
  resetTimerAction,
  setTakeCameraOffsetAction,
  setChecklistItemAction,
  overrideChecklistGateAction,
  endTimerAction,
  setCurrentSectionAction,
  saveDirectorNotesAction,
  createMarkerAction,
  toggleQuestionDoneAction,
  setCurrentQuestionAction,
} from "./actions"
import type { SectionKind, PrepV2Question, PrepV2Insight } from "@/lib/preparation/v2/types"
import { RecordingClock } from "./recording-clock"
import { markerStyle, formatPrecise, nowMs, computeElapsedMs } from "./recording-shared"
import { INSIGHT_META } from "./cockpit-bits"
import { PreflightView, EnergyLabel } from "./preflight-view"
import { OnAirView } from "./onair-view"
import { WrapView } from "./wrap-view"
import { ChecklistPanel } from "./checklist-panel"
import { PreflightGate } from "./preflight-gate"
import type { TagResult } from "./flag-control"
import {
  deriveChecklistModel,
  deriveHostGateState,
} from "@/lib/recording-v2/preflight-checklist"
import { runAction, failureMessageForResult } from "@/app/admin/components/run-action"
import { AlertTriangle, Info, X } from "lucide-react"

/** How long an «تراجع» stays offered. */
export const UNDO_WINDOW_MS = 5_000

/** The shape every room action in actions.ts resolves to, loosely. */
type ActionResult = { ok: boolean; error?: string; room?: CollaborationRoom | null }

export function LiveV2Client({ initial }: { initial: LiveV2Snapshot }) {
  const room = initial.room
  const prep = initial.preparation
  const sections = prep.prep_v2?.episode_sections ?? null

  // ── Live energy — TWO numbers, deliberately ────────────────────────
  //
  //  displayedEnergy : the shared room value. Live for everyone, moved by the
  //                    host OR the director, drives the ribbon + energy_change
  //                    markers. Reaches the host instantly, as asked.
  //  approved        : what the QUESTION RANKING reads. Moves only by the
  //                    host's hand (his dial, or his approval of a cue).
  const { room: liveRoom, updateEnergy, sendEnergyDecision, participants } = useRoomState()
  const { status: connStatus, reconnect } = useRoomConnection()
  const displayedEnergy = liveRoom?.energy_level ?? room.energy_level ?? 3

  const [handshake, setHandshake] = useState<EnergyHandshakeState>(() =>
    initEnergyHandshake(room.energy_level ?? 3),
  )
  const band = energyBand(handshake.approved)

  // ── Errors + notices (overlay, deduplicated) ───────────────────────
  //
  // A list, not a string, so two different failures are both visible — and
  // DEDUPLICATED, so the same failure repeating (a dead stream fails every
  // hero change) is one line, not a growing stack.
  const [errors, setErrors] = useState<string[]>([])
  const pushError = (message: string) =>
    setErrors((prev) => (prev.includes(message) ? prev : [...prev, message]))
  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => setNotice(null), 6_000)
    return () => window.clearTimeout(t)
  }, [notice])

  // ── Undo (5s) for «طُرِح» ─────────────────────────────────────────
  const [undo, setUndo] = useState<{ key: number; label: string; run: () => void } | null>(null)
  useEffect(() => {
    if (!undo) return
    const t = window.setTimeout(() => setUndo(null), UNDO_WINDOW_MS)
    return () => window.clearTimeout(t)
  }, [undo])

  /**
   * The on-air hero PIN — which question is on screen, and its wording at the
   * moment it was pinned.
   *
   * It pins what is DISPLAYED. Unpinned, the hero was "whatever tops the
   * ranking", so anything that re-ranked (a question asked on another device,
   * a live prep edit) could swap the question under a host reading it aloud.
   * The pin moves only by the host's hand: «طُرِح», picking a question, a new
   * section — and his OWN dial crossing a band (`hero: "reset"`, the locked
   * rule that keeps the dial from being dead). Approving a director cue keeps
   * the question and re-ranks only what follows.
   */
  const [pin, setPin] = useState<{ id: string; text: string } | null>(null)
  const heroId = pin?.id ?? null

  // The reducer's side effects (telling the director, moving the pin) must NOT
  // run inside a `setState` updater — React may invoke an updater more than
  // once, which would double-post the decision. So the current state is mirrored
  // in a ref and the dispatch is a plain function.
  const handshakeRef = useRef(handshake)
  handshakeRef.current = handshake

  function dispatchEnergy(event: EnergyHandshakeEvent) {
    const r = energyHandshake(handshakeRef.current, event)
    if (r.state === handshakeRef.current && !r.decision && !r.hero) return
    // Approval: the pin already holds what is on screen (it always does now),
    // so the re-rank below can only change the "next up" rows.
    handshakeRef.current = r.state
    setHandshake(r.state)
    if (r.decision) {
      void sendEnergyDecision(
        r.decision.kind,
        r.decision.level,
        r.state.approved,
        r.decision.muted === true,
      )
    }
    if (r.hero === "reset") setPin(null)
  }

  // ── Transport — derived from the room, optimistic only in flight ───
  const [transport, setTransport] = useState<TransportState>(() => transportFromRoom(room))
  const transportRef = useRef(transport)
  transportRef.current = transport
  const { status, elapsedMsAtBaseline, windowStartedAt } = transport
  /** Host requests still in flight; while > 0 the room broadcast is not applied. */
  const pendingOps = useRef(0)
  const lastAppliedAt = useRef<string | null>(null)

  /** Current elapsed ms, derived on demand (no per-frame state here). */
  function nowElapsed(): number {
    return computeElapsedMs(elapsedMsAtBaseline, windowStartedAt, status === "live")
  }

  // The shared value moved. If it is not what the host ranks on, it is a cue —
  // but only once a take is running. Before "ابدأ التسجيل" the dial is just a
  // setting being agreed on, so it is ADOPTED silently.
  useEffect(() => {
    if (status === "live" || status === "paused") {
      dispatchEnergy({ kind: "displayed", level: displayedEnergy, now: Date.now() })
    } else {
      dispatchEnergy({ kind: "reset", level: displayedEnergy })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedEnergy])

  // A cue nobody reacts to is dropped after 90s — and the drop is VISIBLE.
  useEffect(() => {
    const pending = handshake.pending
    if (!pending) return
    const t = setTimeout(
      () => dispatchEnergy({ kind: "expire", now: Date.now() }),
      Math.max(0, pending.expiresAt - Date.now()),
    )
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handshake.pending])

  useEffect(() => {
    if (!handshake.lapsed) return
    const t = setTimeout(
      () => dispatchEnergy({ kind: "clear_lapsed" }),
      ENERGY_LAPSE_NOTICE_MS,
    )
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handshake.lapsed])

  /** The host has moved his dial this take — gates the "flat section" line. */
  const [dialTouched, setDialTouched] = useState(false)

  /**
   * The host's own dial — an OWNER ACTION, applied to BOTH numbers.
   *
   * `host_set` moves the ranking energy and cancels any pending cue; the PATCH
   * moves the shared displayed value. The PATCH is skipped only when the shared
   * value is ALREADY what he tapped — re-sending it would write a second
   * identical `energy_change` marker.
   */
  const onSetEnergy = (level: number) => {
    if (status === "live" || status === "paused") setDialTouched(true)
    dispatchEnergy({ kind: "host_set", level, now: Date.now() })
    if (level !== displayedEnergy) void updateEnergy(level)
  }

  const onApproveEnergy = () => dispatchEnergy({ kind: "approve", now: Date.now() })

  // Which recording attempt is loaded.
  const [takeNumber, setTakeNumber] = useState<number>(room.take_number)
  const takeRef = useRef(takeNumber)
  takeRef.current = takeNumber

  // Camera-sync correction for the current take. Local so the wrap screen shows
  // the saved value immediately; a new take starts uncorrected.
  const [cameraOffsetMs, setCameraOffsetMs] = useState<number | null>(
    room.camera_offset_ms,
  )
  // ── Pre-shoot checklist ───────────────────────────────────────────
  //
  // Both sources are take-matched, and an unmatched source yields an EMPTY list
  // — never the other source (a re-shoot starts locked until the SSE slice
  // reports rows for the new take).
  const { checklist: liveChecklist, takeNumber: liveChecklistTake } = useRoomChecklist()
  const checklistEntries = useMemo(() => {
    if (liveChecklist && liveChecklistTake === takeNumber) return liveChecklist
    if (room.take_number === takeNumber) return room.checklist
    return []
  }, [liveChecklist, liveChecklistTake, takeNumber, room.checklist, room.take_number])
  const checklistModel = useMemo(
    () => deriveChecklistModel(checklistEntries),
    [checklistEntries],
  )

  const [selfCompleting, setSelfCompleting] = useState(false)
  const [overridden, setOverridden] = useState(room.checklist_overridden)

  const gateState = deriveHostGateState({
    model: checklistModel,
    // Presence only — never a permission input (every action is gated by
    // requireActionRole against admin_users.role). It selects which help text
    // and which escape hatches appear.
    directorOnline: participants.some((p) => p.is_online && p.role === "director"),
    connected: connStatus === "connected",
    connecting: connStatus === "connecting" || connStatus === "reconnecting",
  })

  const directorLabel = useMemo(() => {
    const d = participants.find((p) => p.is_online && p.role === "director")
    const at = checklistModel.lastUpdatedAt
    const time = at
      ? new Date(at).toLocaleTimeString("ar-KW", { hour: "2-digit", minute: "2-digit" })
      : null
    if (!d) return null
    return `${d.display_name} (المخرج) متصل${time ? ` · آخر تحديث ${time}` : ""}`
  }, [participants, checklistModel.lastUpdatedAt])

  async function onSetChecklistItem(
    itemKey: string,
    state: "done" | "not_applicable" | "pending",
    reason?: string,
  ) {
    const outcome = await runAction(() =>
      setChecklistItemAction({
        roomId: room.id,
        itemKey,
        state,
        notApplicableReason: reason ?? null,
      }),
    )
    if (!outcome.ok) pushError(outcome.message)
    else if (!outcome.data.ok) pushError(failureMessageForResult((outcome.data as ActionResult).error))
  }

  async function onOverride(reason: string): Promise<boolean> {
    const outcome = await runAction(() =>
      overrideChecklistGateAction({
        roomId: room.id,
        reason,
        resolvedCount: checklistModel.resolvedCount,
        total: checklistModel.total,
      }),
    )
    if (!outcome.ok) {
      pushError(outcome.message)
      return false
    }
    if (!outcome.data.ok) {
      pushError(failureMessageForResult((outcome.data as ActionResult).error))
      return false
    }
    setOverridden(true)
    return true
  }

  async function onSetCameraOffset(ms: number): Promise<boolean> {
    const outcome = await runAction(() =>
      setTakeCameraOffsetAction({ roomId: room.id, takeNumber, offsetMs: ms }),
    )
    if (!outcome.ok || !outcome.data.ok) return false
    const r = outcome.data as { camera_offset_ms?: number | null }
    setCameraOffsetMs(r.camera_offset_ms ?? ms)
    return true
  }

  // Energy ribbon — built from the room's energy_change markers, scoped to the
  // current take (offsets restart at zero on a re-shoot).
  const { markers: sessionMarkers } = useRoomMarkers()
  const energyHistory = useMemo(() => {
    const pts = sessionMarkers
      .filter((m) => m.marker_type === "energy_change" && m.take_number === takeNumber)
      .map((m) => ({
        net_recording_ms: m.net_recording_ms,
        level: Math.max(0, Math.min(5, Number(m.note) || 3)),
      }))
      .sort((a, b) => a.net_recording_ms - b.net_recording_ms)
    const byMs = new Map<number, number>()
    for (const p of pts) byMs.set(p.net_recording_ms, p.level)
    return [...byMs.entries()].map(([net_recording_ms, level]) => ({ net_recording_ms, level }))
  }, [sessionMarkers, takeNumber])

  // ── Section — tracked by KEY, the index is derived ────────────────
  //
  // By index alone, a live prep edit that reordered sections silently moved
  // the host into a different one.
  const [sectionKey, setSectionKey] = useState<SectionKind | null>(
    (room.current_section_key as SectionKind | null) ??
      sections?.[room.current_section_index ?? 0]?.kind ??
      null,
  )
  const sectionIndex = sectionIndexFor(sections, sectionKey, room.current_section_index ?? 0)
  const currentSection: SectionKind | null = sections ? (sections[sectionIndex]?.kind ?? null) : null
  const [sectionStartedMs, setSectionStartedMs] = useState<number | null>(
    room.current_section_started_ms,
  )
  const [completedSections, setCompletedSections] = useState<Set<number>>(
    new Set(Array.from({ length: sectionIndex }, (_, i) => i)),
  )

  // ── Question completion (persisted + SSE-synced via the room row) ──
  const [completedQuestionIds, setCompletedQuestionIds] = useState<Set<string>>(
    new Set(room.completed_question_ids ?? []),
  )

  // ── Notes (debounced autosave) ────────────────────────────────────
  const [notes, setNotes] = useState(room.director_notes)
  const [, startNotesTransition] = useTransition()
  const noteSaveTimer = useRef<NodeJS.Timeout | null>(null)
  function onNotesChange(value: string) {
    setNotes(value)
    if (noteSaveTimer.current) clearTimeout(noteSaveTimer.current)
    noteSaveTimer.current = setTimeout(() => {
      startNotesTransition(async () => {
        // A failure here must be visible, because the host keeps typing into a
        // box that looks saved.
        const outcome = await runAction(() =>
          saveDirectorNotesAction({ roomId: room.id, notes: value }),
        )
        if (!outcome.ok) pushError(outcome.message)
        else if (!outcome.data.ok) pushError(failureMessageForResult((outcome.data as ActionResult).error))
      })
    }, 750)
  }

  // ── Markers (latest-first) ────────────────────────────────────────
  const [markers, setMarkers] = useState<LiveV2Marker[]>(initial.markers)

  /** Everything a take accumulated, cleared for take N+1 (mirrors `resetTimer`). */
  function clearTakeLocalState() {
    setCompletedQuestionIds(new Set())
    setCompletedSections(new Set())
    setSectionKey(sections?.[0]?.kind ?? null)
    setSectionStartedMs(null)
    setPin(null)
    setNotes("")
    setMarkers([])
    // The new take has no anchor row until it starts.
    setCameraOffsetMs(null)
    // RE-ARM THE GATE: the override and "who confirms" are per-take.
    setOverridden(false)
    setSelfCompleting(false)
    setDialTouched(false)
    // The energy handshake is per-take too, mute included.
    dispatchEnergy({ kind: "reset", level: displayedEnergy })
  }

  /**
   * Adopt a room row as the truth — from an action's reply or from SSE.
   * Skips rows older than the last one applied.
   */
  function applyRoomRow(row: CollaborationRoom) {
    if (
      lastAppliedAt.current &&
      row.updated_at &&
      Date.parse(row.updated_at) < Date.parse(lastAppliedAt.current)
    ) {
      return
    }
    lastAppliedAt.current = row.updated_at ?? lastAppliedAt.current
    if (typeof row.take_number === "number" && row.take_number !== takeRef.current) {
      setTakeNumber(row.take_number)
      if (row.take_number > takeRef.current) clearTakeLocalState()
    }
    const next = transportFromRoom(row)
    const cur = transportRef.current
    if (
      next.status !== cur.status ||
      next.elapsedMsAtBaseline !== cur.elapsedMsAtBaseline ||
      next.windowStartedAt !== cur.windowStartedAt
    ) {
      setTransport(next)
      if (next.status === "live" || next.status === "paused") {
        // The take has an anchor row once it has started.
        setCameraOffsetMs((prev) => prev ?? 0)
      }
    }
    if (row.current_section_key) setSectionKey(row.current_section_key as SectionKind)
    if (row.current_section_started_ms !== undefined) {
      setSectionStartedMs(row.current_section_started_ms ?? null)
    }
    if (Array.isArray(row.completed_question_ids)) {
      const ids = row.completed_question_ids
      setCompletedQuestionIds((prev) =>
        prev.size === ids.length && ids.every((id) => prev.has(id)) ? prev : new Set(ids),
      )
    }
  }

  // The room broadcast — applied whenever none of the host's own requests is
  // in flight (those reconcile from their own reply).
  useEffect(() => {
    if (!liveRoom) return
    if (
      !shouldApplyRoomRow({
        pendingOps: pendingOps.current,
        incomingUpdatedAt: liveRoom.updated_at,
        lastAppliedUpdatedAt: lastAppliedAt.current,
      })
    ) {
      return
    }
    applyRoomRow(liveRoom)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveRoom])

  // ── Timer actions ─────────────────────────────────────────────────
  const [busy, startTransition] = useTransition()

  /**
   * Every transport move goes through here: apply the optimistic state, call
   * the action, then either adopt the row the server broadcast or ROLL BACK.
   *
   * Pause and end used to flip the screen first and never look back: a pause
   * the server rejected left the host's clock frozen on a take that was still
   * running. `runAction` never rejects, so the transition always settles and
   * `busy` always clears.
   */
  function transportOp(optimistic: TransportState | null, call: () => Promise<unknown>, after?: () => void) {
    startTransition(async () => {
      const before = transportRef.current
      pendingOps.current++
      if (optimistic) setTransport(optimistic)
      const outcome = await runAction(call)
      pendingOps.current--
      const r = outcome.ok ? (outcome.data as ActionResult) : null
      const next = transportAfterAction(before, r)
      if (next.failed) {
        if (next.state) setTransport(next.state) // roll back
        pushError(outcome.ok ? failureMessageForResult(r?.error) : outcome.message)
        return
      }
      after?.()
      if (r?.room) applyRoomRow(r.room)
    })
  }

  const onStart = () =>
    transportOp(
      { status: "live", elapsedMsAtBaseline: 0, windowStartedAt: nowMs() },
      () => startTimerAction(room.id),
      // startTimer created this take's anchor row, so an offset can be recorded.
      () => setCameraOffsetMs((prev) => prev ?? 0),
    )
  const onPause = () =>
    transportOp(
      { status: "paused", elapsedMsAtBaseline: nowElapsed(), windowStartedAt: null },
      () => pauseTimerAction(room.id),
    )
  const onResume = () =>
    transportOp(
      { status: "live", elapsedMsAtBaseline: elapsedMsAtBaseline, windowStartedAt: nowMs() },
      () => resumeTimerAction(room.id),
    )
  /**
   * Open a new take. Destructive enough to confirm. Everything the previous
   * take accumulated is cleared to match what `resetTimer` clears server-side;
   * the markers themselves stay in the DB tagged with their own take number.
   */
  const onReset = () => {
    if (
      !window.confirm(
        "إعادة الضبط تبدأ تسجيلاً جديداً (تيك جديد): يصفّر المؤقّت، والأسئلة المطروحة، وملاحظات المخرج. العلامات المسجّلة تُحفظ باسم التيك الحالي. تكمل؟",
      )
    ) {
      return
    }
    startTransition(async () => {
      pendingOps.current++
      const outcome = await runAction(() => resetTimerAction(room.id))
      pendingOps.current--
      const r = outcome.ok ? (outcome.data as ActionResult & { take_number?: number }) : null
      if (!r || !r.ok) {
        pushError(outcome.ok ? failureMessageForResult(r?.error) : outcome.message)
        return
      }
      if (typeof r.take_number === "number") setTakeNumber(r.take_number)
      setTransport({ status: "waiting", elapsedMsAtBaseline: 0, windowStartedAt: null })
      clearTakeLocalState()
      if (r.room) applyRoomRow(r.room)
    })
  }
  const onEnd = () =>
    transportOp(
      { status: "ended", elapsedMsAtBaseline: nowElapsed(), windowStartedAt: null },
      () => endTimerAction(room.id),
    )

  // ── Question completion ───────────────────────────────────────────
  async function toggleQuestionDone(questionId: string) {
    const flip = (s: Set<string>) => {
      const next = new Set(s)
      if (next.has(questionId)) next.delete(questionId)
      else next.add(questionId)
      return next
    }
    setCompletedQuestionIds(flip) // optimistic
    pendingOps.current++
    const outcome = await runAction(() => toggleQuestionDoneAction({ roomId: room.id, questionId }))
    pendingOps.current--
    const r = outcome.ok ? (outcome.data as ActionResult & { completed?: string[] }) : null
    if (r?.ok && Array.isArray(r.completed)) {
      setCompletedQuestionIds(new Set(r.completed)) // reconcile to server truth
    } else {
      setCompletedQuestionIds(flip) // rejected / failed → revert
      pushError(outcome.ok ? failureMessageForResult(r?.error) : outcome.message)
    }
  }

  // ── Flow actions ─────────────────────────────────────────────────
  async function moveTo(idx: number) {
    if (!sections) return
    const clamped = Math.max(0, Math.min(sections.length - 1, idx))
    const key = sections[clamped].kind
    if (key === currentSection) return

    // Leaving with a «أساسي» unasked is allowed — the host decides — but never
    // silent: a quiet line says what was left behind. The wrap screen lists
    // every skipped must-ask again.
    const left = unaskedMustAsk(prep.prep_v2?.question_bank ?? [], currentSection, completedQuestionIds)
    if (left.length > 0 && clamped > sectionIndex) {
      const where = currentSection ? sectionLabelAr(currentSection, sections) : ""
      setNotice(
        left.length === 1
          ? `بقي سؤال أساسي في «${where}»`
          : `بقي ${left.length} أسئلة أساسية في «${where}»`,
      )
    }

    const before = { key: sectionKey, started: sectionStartedMs }
    setCompletedSections((prev) => {
      if (clamped <= sectionIndex) return prev
      const next = new Set(prev)
      for (let i = 0; i < clamped; i++) next.add(i)
      return next
    })
    setSectionKey(key)
    // Optimistic section start; the server stamps its own and we adopt it.
    setSectionStartedMs(nowElapsed())
    // A pin belongs to the section it was made in.
    setPin(null)
    pendingOps.current++
    const outcome = await runAction(() =>
      setCurrentSectionAction({ roomId: room.id, index: clamped, key }),
    )
    pendingOps.current--
    const r = outcome.ok ? (outcome.data as ActionResult) : null
    if (!r || !r.ok) {
      setSectionKey(before.key)
      setSectionStartedMs(before.started)
      pushError(
        outcome.ok
          ? failureMessageForResult(r?.error)
          : `ما انتقل القسم عند الفريق — ${outcome.message}`,
      )
      return
    }
    if (r.room) applyRoomRow(r.room)
  }

  // ── Marker dispatch ──────────────────────────────────────────────
  /**
   * Returns what happened so the tapped button can say it: «✓ عُلّمت …» or
   * that it did not land. It used to swallow every failure ("a transient
   * failure shouldn't surface mid-take") — so a host whose session had expired
   * flagged a whole episode into nothing.
   */
  async function tag(type: QuickMarkerType, label: string): Promise<TagResult> {
    const fallbackMs = nowElapsed()
    const outcome = await runAction(() =>
      createMarkerAction({ roomId: room.id, markerType: type, label, sectionKey: currentSection }),
    )
    if (!outcome.ok) {
      pushError(outcome.message)
      return { ok: false, message: "ما وصلت — أعد" }
    }
    const r = outcome.data as ActionResult & { marker_id?: string; net_recording_ms?: number }
    if (!r.ok) {
      const message =
        r.error === "recording_not_started"
          ? "التسجيل ما بدأ بعد"
          : failureMessageForResult(r.error)
      pushError(message)
      return { ok: false, message: r.error === "unauthorized" ? "انتهت الجلسة" : "ما وصلت — أعد" }
    }
    const ms = r.net_recording_ms ?? fallbackMs
    setMarkers((prev) => [
      {
        id: r.marker_id ?? crypto.randomUUID(),
        marker_type: type,
        label,
        note: null,
        net_recording_ms: ms,
        take_number: takeNumber,
        // Camera time is derived server-side from the take anchor; `null` =
        // "not yet resolved", which the recap renders honestly.
        camera_ms: null,
        section_key: currentSection,
        created_at: new Date().toISOString(),
        author_name: "you",
      },
      ...prev,
    ])
    return { ok: true, ms }
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
    const outcome = await runAction(() =>
      createMarkerAction({
        roomId: room.id,
        markerType: "insight_used",
        label: "إسناد",
        note,
        sectionKey: currentSection,
      }),
    )
    const r = outcome.ok ? (outcome.data as ActionResult & { marker_id?: string; net_recording_ms?: number }) : null
    if (!r || !r.ok) {
      revert()
      pushError(outcome.ok ? failureMessageForResult(r?.error) : outcome.message)
      return
    }
    setMarkers((prev) => [
      {
        id: r.marker_id ?? crypto.randomUUID(),
        marker_type: "insight_used",
        label: "إسناد",
        note,
        net_recording_ms: r.net_recording_ms ?? fallbackMs,
        take_number: takeNumber,
        camera_ms: null,
        section_key: currentSection,
        created_at: new Date().toISOString(),
        author_name: "you",
      },
      ...prev,
    ])
  }

  // ── Section question list — ranked by energy fit ──────────────────
  const currentSectionQuestions: PrepV2Question[] = useMemo(() => {
    if (!prep.prep_v2 || !currentSection) return []
    const all = prep.prep_v2.question_bank.filter((q) => q.section === currentSection)
    return rankQuestionsByEnergy(all, band, (id) => completedQuestionIds.has(id))
  }, [prep.prep_v2, currentSection, band, completedQuestionIds])

  const openQuestions = useMemo(
    () => currentSectionQuestions.filter((q) => !completedQuestionIds.has(q.id)),
    [currentSectionQuestions, completedQuestionIds],
  )

  // The question on screen — the SAME call onair-view renders from.
  const displayedHero = resolveHero(openQuestions, heroId)
  const displayedHeroId = displayedHero?.id ?? null
  /**
   * PIN WHAT IS DISPLAYED. Adjusted during render (React's "store information
   * from previous renders" pattern), not in an effect — from an effect the
   * question would move for a frame before the pin caught it.
   */
  if (displayedHero && pin?.id !== displayedHero.id) {
    setPin({ id: displayedHero.id, text: displayedHero.text })
  }
  const heroEdited = pinnedQuestionEdited(pin, displayedHero)

  /**
   * ── PUBLISH «الآن» ─────────────────────────────────────────────────────────
   * What is literally on the host's screen goes to `current_question_id`, so
   * the director and the editor read the same line. It used to be written to
   * `active_card_id` — an FK to interview_cards that rejected every prep_v2 id
   * — by a fire-and-forget call that swallowed the 23503. A failure is now
   * reported (once — the list deduplicates) and retried on the next change.
   */
  const publishedHeroRef = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (!prep.prep_v2) return
    if (publishedHeroRef.current === displayedHeroId) return
    publishedHeroRef.current = displayedHeroId
    void (async () => {
      const outcome = await runAction(() =>
        setCurrentQuestionAction({ roomId: room.id, questionId: displayedHeroId }),
      )
      const r = outcome.ok ? (outcome.data as ActionResult) : null
      if (!r || !r.ok) {
        publishedHeroRef.current = undefined // retry on the next change
        pushError(
          r?.error === "unauthorized"
            ? failureMessageForResult("unauthorized")
            : "الفريق ما يشوف السؤال الحالي عندك — تأكّد من الاتصال.",
        )
      }
    })()
  }, [displayedHeroId, room.id, prep.prep_v2])

  /**
   * Whether the dial can reorder anything HERE. Four of the six sections in the
   * real prep hold no sharp question at all — by editorial choice.
   */
  const energyReordersSection = useMemo(
    () => sectionRespondsToEnergy(currentSectionQuestions, (id) => completedQuestionIds.has(id)),
    [currentSectionQuestions, completedQuestionIds],
  )

  // The whisper follows the APPROVED energy, not the displayed one — it and the
  // ranking must say the same thing. While a cue is on screen it goes quiet.
  const prepFormat = prepFormatOf(prep.prep_v2)
  const hint = handshake.pending
    ? null
    : coachHint(currentSection, handshake.approved, prepFormat)
  // Energy markers drive the ribbon, not the content pins / count / list.
  const contentMarkers = markers.filter((m) => m.marker_type !== "energy_change")

  // ── Host actions on the hero ─────────────────────────────────────
  function pickHero(id: string) {
    const q = currentSectionQuestions.find((x) => x.id === id)
    if (q) setPin({ id: q.id, text: q.text })
  }

  /** «طُرِح» on the question on screen — with a 5s «تراجع». */
  function markAsked(id: string) {
    const q = currentSectionQuestions.find((x) => x.id === id)
    if (!q || completedQuestionIds.has(id)) return
    void toggleQuestionDone(id)
    setUndo({
      key: Date.now(),
      label: "طُرِح",
      run: () => {
        void toggleQuestionDone(id)
        // Bring the same question back on screen, not whatever tops the list.
        setPin({ id: q.id, text: q.text })
      },
    })
  }

  /** N / B — step through the OPEN questions of this section, in list order. */
  function stepHero(delta: 1 | -1) {
    if (openQuestions.length < 2) return
    const i = Math.max(0, openQuestions.findIndex((q) => q.id === displayedHeroId))
    const next = openQuestions[(i + delta + openQuestions.length) % openQuestions.length]
    setPin({ id: next.id, text: next.text })
  }

  // ── Chosen opening (read-in → first question) ─────────────────────
  const openingKey = `khat:recording:${room.id}:opening`
  const [chosenOpening, setChosenOpening] = useState<number | null>(null)
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(openingKey)
      if (v != null && Number.isInteger(Number(v))) setChosenOpening(Number(v))
    } catch {
      // storage unavailable (private window) — the first option is the default
    }
  }, [openingKey])
  function chooseOpening(i: number) {
    setChosenOpening(i)
    try {
      window.localStorage.setItem(openingKey, String(i))
    } catch {
      // per-viewer convenience only
    }
  }
  const openingOptions = prep.prep_v2?.opening_options ?? []
  const openingLine = openingOptions[chosenOpening ?? 0] ?? openingOptions[0] ?? null

  // ── On air: keep the screen awake, guard the tab, keyboard ─────────
  const onAir = status === "live" || status === "paused"

  /**
   * Wake lock while a take runs. An iPad on a stand dims and locks after its
   * idle timeout — mid-answer, with the host's hands in his lap. Re-acquired on
   * return to the tab (the OS drops it whenever the page is hidden).
   */
  useEffect(() => {
    if (!onAir) return
    let lock: WakeLockSentinel | null = null
    let disposed = false
    const acquire = async () => {
      try {
        if (!("wakeLock" in navigator) || document.visibilityState !== "visible") return
        const l = await navigator.wakeLock.request("screen")
        if (disposed) void l.release().catch(() => {})
        else lock = l
      } catch {
        // Not supported / denied (battery saver). Nothing to show mid-take.
      }
    }
    void acquire()
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      disposed = true
      document.removeEventListener("visibilitychange", onVisible)
      void lock?.release().catch(() => {})
    }
  }, [onAir])

  /**
   * Leaving the page mid-take asks first. Presence is no longer torn down on
   * `beforeunload` (see recording-room-shell): a cancelled leave must not have
   * already signed the host out of the room.
   */
  useEffect(() => {
    if (!onAir) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [onAir])

  // Keyboard shortcuts (Bluetooth keyboard / clicker). Optional by nature: every
  // action is also a touch target. No key ends a take.
  const [legendOpen, setLegendOpen] = useState(false)
  const keyActions = useRef({
    asked: () => {},
    flag: () => {},
    transport: () => {},
    next: () => {},
    prev: () => {},
  })
  keyActions.current = {
    asked: () => displayedHeroId && markAsked(displayedHeroId),
    flag: () => void tag("highlight", QUICK_MARKER_META.highlight.defaultLabel),
    transport: () => (status === "live" ? onPause() : status === "paused" ? onResume() : undefined),
    next: () => stepHero(1),
    prev: () => stepHero(-1),
  }
  useEffect(() => {
    if (!onAir) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      if (isTypingTarget(e.target)) return
      const action = shortcutFor(e.key)
      if (!action) return
      if (action === "legend") {
        e.preventDefault()
        setLegendOpen((o) => !o)
        return
      }
      // While a sheet is open the keys belong to it.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
      e.preventDefault()
      keyActions.current[action]()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onAir])

  /**
   * ERRORS + NOTICES — an OVERLAY above the bottom bar.
   *
   * The error banner used to sit in normal flow above the view (it once was a
   * `fixed top-0` overlay that covered pause/end, so it was moved into flow).
   * In flow, every failure shoved the whole cockpit down mid-take. Now the rail
   * is sticky at the top, so the top edge stays spoken for, and this floats at
   * the BOTTOM, clear of the thumb bar (`--khat-bottom-bar`), covering neither.
   * `role="alert"` still announces it. Each line is dismissible; identical
   * failures collapse into one line.
   */
  const actionErrorBanner =
    errors.length > 0 || notice || undo ? (
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--khat-bottom-bar,0px)+0.5rem)] z-40 px-3"
        dir="rtl"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-2 lg:max-w-5xl">
          {undo && (
            <div
              role="status"
              className="pointer-events-auto flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2 text-[14px] text-foreground shadow-lg"
            >
              <span>{undo.label}</span>
              <button
                type="button"
                onClick={() => {
                  undo.run()
                  setUndo(null)
                }}
                className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-4 font-semibold text-primary"
              >
                تراجع
              </button>
            </div>
          )}
          {notice && (
            <div
              role="status"
              className="pointer-events-auto flex items-center gap-2 rounded-xl border border-amber-500/40 bg-card px-4 py-2 text-[14px] font-medium text-amber-800 shadow-lg"
            >
              <Info className="h-4 w-4 shrink-0" />
              <span className="flex-1">{notice}</span>
              <button
                type="button"
                onClick={() => setNotice(null)}
                aria-label="إخفاء"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          {errors.length > 0 && (
            <div role="alert" className="pointer-events-auto flex flex-col gap-1.5">
              {errors.map((message) => (
                <div
                  key={message}
                  className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-card px-4 py-2 text-[14px] text-red-700 shadow-lg"
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span className="flex-1">{message}</span>
                  <button
                    type="button"
                    onClick={() => setErrors((prev) => prev.filter((m) => m !== message))}
                    className="inline-flex min-h-[36px] shrink-0 items-center rounded-lg px-2 text-[13px] text-muted-foreground hover:bg-muted"
                  >
                    إخفاء
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    ) : null
  const withBanner = (node: ReactNode) => (
    <>
      {actionErrorBanner}
      {node}
    </>
  )

  // ── Phase routing ─────────────────────────────────────────────────
  const pv = prep.prep_v2
  if (!pv) {
    return withBanner(
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
    // The host either sees the gate bar, or — after choosing "أكمل التشك-ليست
    // بنفسي" — the director's own checklist on their screen.
    if (selfCompleting) {
      return withBanner(
        <ChecklistPanel
          model={checklistModel}
          onSet={onSetChecklistItem}
          busy={busy}
          previousTakeWasComplete={room.checklist_previous_take_complete}
          takeNumber={takeNumber}
          selfMode
          onStart={onStart}
          onBack={() => setSelfCompleting(false)}
        />
      )
    }
    return withBanner(
      <PreflightView
        gate={
          <PreflightGate
            gateState={gateState}
            model={checklistModel}
            overridden={overridden}
            directorLabel={directorLabel}
            onStart={onStart}
            onSelfComplete={() => setSelfCompleting(true)}
            onOverride={onOverride}
            onReconnect={reconnect}
            busy={busy}
          >
            <EnergyLabel energy={displayedEnergy} canSetEnergy onSetEnergy={onSetEnergy} />
          </PreflightGate>
        }
        title={prep.title}
        guestName={prep.guest_name}
        thesis={pv.thesis}
        axes={pv.axes_of_tension}
        hostGuidance={pv.host_guidance}
        openingOptions={pv.opening_options}
        chosenOpening={chosenOpening}
        onChooseOpening={chooseOpening}
        sensitiveZones={pv.sensitive_zones}
        sections={pv.episode_sections}
        format={prepFormat}
        energy={displayedEnergy}
        canSetEnergy
        onSetEnergy={onSetEnergy}
        onStart={onStart}
        busy={busy}
      />
    )
  }

  if (status === "ended") {
    return withBanner(
      <WrapView
        roomId={room.id}
        durationMs={nowElapsed()}
        sectionsTotal={pv.episode_sections.length}
        sectionsDone={completedSections.size}
        questionsAsked={completedQuestionIds.size}
        questionsTotal={pv.question_bank.length}
        skippedMustAsk={pv.question_bank.filter(
          (q) => q.priority === "must_ask" && !completedQuestionIds.has(q.id),
        )}
        sections={pv.episode_sections}
        markers={contentMarkers}
        closingOptions={pv.closing_options}
        takeNumber={takeNumber}
        cameraOffsetMs={cameraOffsetMs}
        onSetCameraOffset={onSetCameraOffset}
        onReset={onReset}
        busy={busy}
      />
    )
  }

  return withBanner(
    <OnAirView
      status={status === "paused" ? "paused" : "live"}
      elapsedMsAtBaseline={elapsedMsAtBaseline}
      windowStartedAt={windowStartedAt}
      busy={busy}
      onPause={onPause}
      onResume={onResume}
      onEnd={onEnd}
      prep={pv}
      sections={pv.episode_sections}
      sectionIndex={sectionIndex}
      currentSection={currentSection}
      sectionStartedMs={sectionStartedMs}
      moveTo={moveTo}
      questions={currentSectionQuestions}
      completedIds={completedQuestionIds}
      onToggleDone={toggleQuestionDone}
      onAsked={markAsked}
      band={band}
      usedInsightIds={usedInsightIds}
      onUseInsight={tagInsight}
      energy={displayedEnergy}
      approvedEnergy={handshake.approved}
      suggestion={handshake.pending}
      lapsedSuggestion={handshake.lapsed}
      onApproveEnergy={onApproveEnergy}
      heroId={heroId}
      onPickHero={pickHero}
      heroEdited={heroEdited}
      energyReordersSection={energyReordersSection}
      dialTouched={dialTouched}
      canSetEnergy
      onSetEnergy={onSetEnergy}
      contentMarkers={contentMarkers}
      energyHistory={energyHistory}
      hint={hint}
      format={prepFormat}
      openingLine={openingLine}
      notes={notes}
      onNotesChange={onNotesChange}
      onTag={tag}
      legendOpen={legendOpen}
      onCloseLegend={() => setLegendOpen(false)}
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
  energyHistory: { net_recording_ms: number; level: number }[]
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
                    {formatPrecise(m.net_recording_ms)}
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
        className="min-h-[120px] w-full resize-y rounded-xl border border-border/40 bg-background/40 p-3 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none"
      />
    </div>
  )
}

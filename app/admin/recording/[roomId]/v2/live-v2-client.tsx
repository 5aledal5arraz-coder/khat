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

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react"
import { Empty } from "../../../components/ui-kit"
import {
  useRoomState,
  useRoomMarkers,
  useRoomChecklist,
  useRoomConnection,
} from "@/app/admin/preparation/[id]/room/contexts"
import type { LiveV2Marker, LiveV2Snapshot } from "@/lib/recording-v2/load"
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
import {
  deriveChecklistModel,
  deriveHostGateState,
} from "@/lib/recording-v2/preflight-checklist"
import { runAction } from "@/app/admin/components/run-action"
import { AlertTriangle } from "lucide-react"

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
  //
  // One number could not satisfy both requirements at once: with one, the
  // director's tap re-sorted the host's list under his eyes, mid-question.
  const { room: liveRoom, updateEnergy, sendEnergyDecision, participants } = useRoomState()
  const { status: connStatus, reconnect } = useRoomConnection()
  const displayedEnergy = liveRoom?.energy_level ?? room.energy_level ?? 3

  const [handshake, setHandshake] = useState<EnergyHandshakeState>(() =>
    initEnergyHandshake(room.energy_level ?? 3),
  )
  const band = energyBand(handshake.approved)

  /**
   * The on-air hero PIN — which question is on screen.
   *
   * It lives here, not in the view, because both moves that touch it have to
   * happen in the SAME synchronous handler that changes the ranking:
   *   • the host crosses a band with his own dial → release the pin, re-deal;
   *   • he approves a director's cue            → pin what is on screen FIRST,
   *     so the re-rank can only change the "next up" row.
   * Done from an effect instead, the question would move for a frame under a
   * host who is reading it out loud.
   */
  const [heroId, setHeroId] = useState<string | null>(null)

  /**
   * ── BROADCAST WHICH QUESTION IS ON SCREEN ────────────────────────────────
   * Khaled: «فيصل وشاهين لازم يشوفون السؤال اللي بيطرحه المحاور … ويعرفون اي
   * سؤال الان وماهو السؤال التالي».
   *
   * The host cockpit ALREADY knew this — `heroId` is the question on his
   * screen, and `nextUp` beside it in onair-view is what follows. It was simply
   * private to his browser. The room only ever recorded which questions were
   * DONE, so the director and the editor were left inferring "probably the
   * first undone one" — an inference that breaks the instant he skips a
   * question or doubles back, which is precisely when they need to know.
   *
   * So nothing new is computed here; the value he already has is published.
   * It rides on `active_card_id`, a column that already exists and already
   * travels with every room broadcast — no migration, no new SSE payload.
   *
   * Fire-and-forget: this is a follow-along signal for other people's screens.
   * If it fails the host must not see an error mid-question, and the next hero
   * change re-sends it anyway.
   */
  const publishedHeroRef = useRef<string | null>(null)


  // The reducer's side effects (telling the director, moving the pin) must NOT
  // run inside a `setState` updater — React may invoke an updater more than
  // once, which would double-post the decision. So the current state is mirrored
  // in a ref and the dispatch is a plain function.
  const handshakeRef = useRef(handshake)
  handshakeRef.current = handshake

  function dispatchEnergy(event: EnergyHandshakeEvent) {
    const r = energyHandshake(handshakeRef.current, event)
    if (r.state === handshakeRef.current && !r.decision && !r.hero) return
    // Freeze the displayed question BEFORE the approval's re-rank lands.
    // `openQuestions` below still holds the PRE-approval ranking here — this
    // function only ever runs after the render body, from a handler or an
    // effect — which is exactly the order this depends on.
    if (r.decision?.kind === "approved") {
      setHeroId((prev) => resolveHero(openQuestions, prev)?.id ?? null)
    }
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
    if (r.hero === "reset") setHeroId(null)
  }

  // The shared value moved. If it is not what the host ranks on, it is a cue —
  // but only once a take is running. Before "ابدأ التسجيل" the dial is just a
  // setting being agreed on, so it is ADOPTED silently: turning it into a cue
  // there would let two pre-roll taps burn the two-strike mute and leave the
  // director unable to signal for the whole take he had not started yet.
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

  /**
   * The host's own dial — an OWNER ACTION, applied to BOTH numbers.
   *
   * `host_set` moves the ranking energy and cancels any pending cue; the PATCH
   * moves the shared displayed value. The PATCH is skipped only when the shared
   * value is ALREADY what he tapped — re-sending it would write a second
   * identical `energy_change` marker and put a duplicate point on the ribbon.
   * The local half always runs, which is what makes re-asserting a diverged
   * value work instead of being silently swallowed.
   */
  const onSetEnergy = (level: number) => {
    dispatchEnergy({ kind: "host_set", level, now: Date.now() })
    if (level !== displayedEnergy) void updateEnergy(level)
  }

  const onApproveEnergy = () => dispatchEnergy({ kind: "approve", now: Date.now() })

  // Which recording attempt is loaded. Bumped by onReset so the ribbon below
  // drops the scrapped take's points without waiting for a reload.
  const [takeNumber, setTakeNumber] = useState<number>(room.take_number)

  // Camera-sync correction for the current take. Local so the wrap screen shows
  // the saved value immediately; a new take starts uncorrected.
  const [cameraOffsetMs, setCameraOffsetMs] = useState<number | null>(
    room.camera_offset_ms,
  )
  // ── Pre-shoot checklist ───────────────────────────────────────────
  //
  // The server-rendered rows are the first paint; the SSE slice takes over the
  // moment it arrives (same contract as prepV2), so the host's gate reacts to the
  // director's taps live. `takeNumber` guards against showing a scrapped take's
  // confirmations after a re-shoot.
  const { checklist: liveChecklist, takeNumber: liveChecklistTake } = useRoomChecklist()
  /**
   * Rows for the take being set up NOW.
   *
   * BOTH sources must be take-matched, and an unmatched source yields an EMPTY
   * list — never the other source. `room.checklist` is a prop from the initial
   * server render: it never updates, so after a reset it still holds the previous
   * take's 17 confirmations. Falling back to it on a take mismatch made the gate
   * open itself for a take whose checklist had not been touched — the exact
   * failure this whole phase exists to prevent.
   *
   * A re-shoot therefore starts locked, and stays locked until the SSE slice
   * reports rows for the new take.
   */
  const checklistEntries = useMemo(() => {
    if (liveChecklist && liveChecklistTake === takeNumber) return liveChecklist
    // Server-render copy is only valid while we are still on the take it was
    // rendered for.
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
    // Presence only — and now actually truthful. Both write paths
    // (`joinRoom` from the join route and `ensureParticipant` when someone
    // tags a moment) stamp the role `resolveRoomRole()` derived from the
    // member's صفحة; `ensureParticipant` used to hardcode "director", which
    // meant the first person to tag anything satisfied this check whatever his
    // job was. Participant rows written before that fix can still carry a
    // wrong "director" — they age out as rooms end.
    //
    // It is still NOT a permission input: every action is gated by
    // requireActionRole against admin_users.role. Here it selects which help
    // text and which escape hatches appear, so its accuracy still matters: see
    // the presence fixes in recording-room-shell (tab close was re-joining via
    // sendBeacon) and the immediate first heartbeat in room-state-context.
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
    await setChecklistItemAction({
      roomId: room.id,
      itemKey,
      state,
      notApplicableReason: reason ?? null,
    })
  }

  async function onOverride(reason: string): Promise<boolean> {
    const r = await overrideChecklistGateAction({
      roomId: room.id,
      reason,
      resolvedCount: checklistModel.resolvedCount,
      total: checklistModel.total,
    })
    if (r.ok) setOverridden(true)
    return r.ok
  }

  async function onSetCameraOffset(ms: number): Promise<boolean> {
    const r = await setTakeCameraOffsetAction({
      roomId: room.id,
      takeNumber,
      offsetMs: ms,
    })
    if (r.ok) setCameraOffsetMs(r.camera_offset_ms)
    return r.ok
  }

  // Energy ribbon — built from the room's energy_change markers (recorded
  // server-side on every change, delivered live over SSE).
  //
  // Scoped to the current take: the SSE snapshot carries every marker in the
  // room, and after a re-shoot the old take's points would be plotted against
  // the new take's timeline (its offsets restart at zero).
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

  // Surfaced by the banner below; shared by the notes autosave and every timer
  // control, since both go through `runAction` now.
  const [actionError, setActionError] = useState<string | null>(null)

  // ── Notes (debounced autosave) ────────────────────────────────────
  const [notes, setNotes] = useState(room.director_notes)
  const [, startNotesTransition] = useTransition()
  const noteSaveTimer = useRef<NodeJS.Timeout | null>(null)
  function onNotesChange(value: string) {
    setNotes(value)
    if (noteSaveTimer.current) clearTimeout(noteSaveTimer.current)
    noteSaveTimer.current = setTimeout(() => {
      startNotesTransition(async () => {
        // Debounced autosave: a failure here must be visible, because the
        // director keeps typing into a box that looks saved.
        const outcome = await runAction(() =>
          saveDirectorNotesAction({ roomId: room.id, notes: value }),
        )
        if (!outcome.ok) setActionError(outcome.message)
      })
    }, 750)
  }

  // ── Markers (latest-first) ────────────────────────────────────────
  const [markers, setMarkers] = useState<LiveV2Marker[]>(initial.markers)

  // ── Timer actions ─────────────────────────────────────────────────
  const [busy, startTransition] = useTransition()
  /**
   * Every timer control (start / pause / resume / reset / end) is routed
   * through here, so this is the single place where their failure behaviour
   * lives — and it used to be `startTransition(fn)` with no catch.
   *
   * Mid-recording that is the worst version of the stranded-transition bug in
   * the admin: one rejected call left `busy` true forever, and `busy` disables
   * the whole timer row, so the director lost start/pause/end on a take that
   * was still rolling, with nothing on screen saying why. `runAction` never
   * rejects, so the transition always settles and the row comes back.
   */
  function withBusy(fn: () => Promise<void>) {
    return () =>
      startTransition(async () => {
        const outcome = await runAction(fn)
        setActionError(outcome.ok ? null : outcome.message)
      })
  }

  const onStart = withBusy(async () => {
    await startTimerAction(room.id)
    setElapsedMsAtBaseline(0)
    setWindowStartedAt(nowMs())
    setStatus("live")
    // startTimer just created this take's anchor row, so an offset can now be
    // recorded against it — 0 until someone measures the real gap.
    setCameraOffsetMs((prev) => prev ?? 0)
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
  /**
   * Open a new take. Destructive enough to confirm: the reset control is
   * reachable mid-recording (RecordingClock), so a stray click used to wipe the
   * running timer with no warning — and now also burns a take number.
   *
   * Everything the previous take accumulated is cleared here to match what
   * `resetTimer` clears server-side; leaving it meant take 2 opened with every
   * question already ticked "asked" and take 1's notes still in the box. The
   * markers themselves are NOT cleared — they stay in the DB tagged with their
   * own take number.
   */
  const onReset = withBusy(async () => {
    if (
      !window.confirm(
        "إعادة الضبط تبدأ تسجيلاً جديداً (تيك جديد): يصفّر المؤقّت، والأسئلة المطروحة، وملاحظات المخرج. العلامات المسجّلة تُحفظ باسم التيك الحالي. تكمل؟",
      )
    ) {
      return
    }
    const r = await resetTimerAction(room.id)
    if (r.ok && typeof r.take_number === "number") setTakeNumber(r.take_number)
    setElapsedMsAtBaseline(0)
    setWindowStartedAt(null)
    setStatus("waiting")
    setCompletedQuestionIds(new Set())
    setCompletedSections(new Set())
    setSectionIndex(0)
    setHeroId(null)
    setNotes("")
    setMarkers([])
    // The new take has no anchor row until it starts, so there is nothing to
    // correct yet — and the previous take's offset must not be shown as if it
    // applied to this one.
    setCameraOffsetMs(null)
    // RE-ARM THE GATE. The override is per-take on the server, but this local
    // flag would have carried it into take 2 inside the same tab — the host
    // would never see the checklist again for the rest of the session. Same for
    // `selfCompleting`: a new take needs a fresh decision about who confirms it.
    setOverridden(false)
    setSelfCompleting(false)
    // The energy handshake is per-take too: a new take re-adopts whatever the
    // room currently shows, and the "quiet for the rest of the take" mute is
    // lifted — it was a judgement about THAT take, not about the director.
    dispatchEnergy({ kind: "reset", level: displayedEnergy })
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
    // A pin belongs to the section it was made in.
    setHeroId(null)
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
            net_recording_ms: r.net_recording_ms ?? fallbackMs,
            take_number: takeNumber,
            // Camera time is derived server-side from the take anchor; an
            // optimistic row cannot know it. `null` = "not yet resolved", which
            // the recap renders honestly instead of inventing a timecode.
            camera_ms: null,
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
            net_recording_ms: r.net_recording_ms ?? fallbackMs,
            take_number: takeNumber,
            // Camera time is derived server-side from the take anchor; an
            // optimistic row cannot know it. `null` = "not yet resolved", which
            // the recap renders honestly instead of inventing a timecode.
            camera_ms: null,
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

  const openQuestions = useMemo(
    () => currentSectionQuestions.filter((q) => !completedQuestionIds.has(q.id)),
    [currentSectionQuestions, completedQuestionIds],
  )

  /**
   * ── PUBLISH THE QUESTION ON SCREEN, NOT THE PIN ──────────────────────────
   * Khalid, from a live take: «سؤال الان لا يتغير، مايتغير فقط السؤال التالي».
   *
   * The first version published `heroId`, and `heroId` is a PIN, not a
   * position. It is null nearly all the time and is only set to freeze the
   * display across a re-rank; what the host actually reads is
   * `resolveHero(openQuestions, heroId)` — the pinned question IF it is still
   * open, otherwise the top of the list.
   *
   * So once anything set the pin, «الآن» froze on that id for the rest of the
   * take while «التالي», derived from the live list on the other side, kept
   * moving. Exactly the split he described, and it only shows up once a pin has
   * been set — which is why it survived the tests and appeared in a real take.
   *
   * `resolveHero` is the same call `onair-view.tsx` renders from, so the
   * director and the editor now read what is literally on the host's screen.
   *
   * Fire-and-forget: a follow-along signal for other people's screens must
   * never surface an error to the host mid-question, and the next change
   * re-sends it anyway.
   */
  const displayedHeroId = resolveHero(openQuestions, heroId)?.id ?? null
  useEffect(() => {
    if (publishedHeroRef.current === displayedHeroId) return
    publishedHeroRef.current = displayedHeroId
    void setCurrentQuestionAction({ roomId: room.id, questionId: displayedHeroId }).catch(
      () => {},
    )
  }, [displayedHeroId, room.id])

  /**
   * Whether the dial can reorder anything HERE. Four of the six sections in the
   * real prep hold no sharp question at all — by editorial choice — so in those
   * the indicator genuinely cannot move the list, and the view says so instead
   * of leaving the host to discover it by moving the dial and seeing nothing.
   */
  const energyReordersSection = useMemo(
    () => sectionRespondsToEnergy(currentSectionQuestions, (id) => completedQuestionIds.has(id)),
    [currentSectionQuestions, completedQuestionIds],
  )

  // The whisper follows the APPROVED energy, not the displayed one — it and the
  // ranking must say the same thing, which is the contradiction this whole
  // change exists to end. And while a cue is on screen the whisper goes quiet:
  // two amber banners competing for the same glance is one too many.
  const hint = handshake.pending ? null : coachHint(currentSection, handshake.approved)
  // Energy markers drive the ribbon, not the content pins / count / list.
  const contentMarkers = markers.filter((m) => m.marker_type !== "energy_change")

  /**
   * IN NORMAL FLOW — deliberately NOT a positioned overlay.
   *
   * What gets this in front of the director from all four phase branches is
   * `withBanner` below; the positioning never contributed to that. As
   * `fixed inset-x-0 top-0 z-50` it left the flow, so nothing reserved its
   * ~44px and it painted on top of the first rows of whatever branch was
   * mounted. In <OnAirView> those rows are the <StatusRail> — pause / resume /
   * end. So the one moment the director needs to stop the take was the one
   * moment the stop button sat underneath a banner.
   *
   * A block in normal flow cannot overlap a later sibling — at any scroll
   * offset, any viewport width. The rail is pushed down instead of covered and
   * the guarantee is structural, not a padding constant that would have to
   * track the banner's wrapped height (which varies with the message).
   *
   * Trade-off taken knowingly: it scrolls with the page instead of staying
   * pinned. `sticky`/`fixed` both re-create the overlap the instant the rail
   * scrolls under them, and a covered stop button is the worse failure.
   * `role="alert"` still announces it regardless of scroll position.
   * Dismissible: mid-take, a banner they cannot clear is its own distraction.
   */
  const actionErrorBanner = actionError ? (
    <div
      role="alert"
      className="flex items-start gap-3 border-b border-red-500/30 bg-card px-4 py-3 text-[13px] text-red-700 shadow-sm"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span className="flex-1">{actionError}</span>
      <button
        type="button"
        onClick={() => setActionError(null)}
        className="shrink-0 rounded-sm px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
      >
        إخفاء
      </button>
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
    // بنفسي" — the director's own checklist on their screen. Same component, same
    // unlock condition; only the confirming person differs.
    if (selfCompleting) {
      return withBanner(
        <ChecklistPanel
          model={checklistModel}
          onSet={onSetChecklistItem}
          busy={busy}
          previousTakeWasComplete={room.checklist_previous_take_complete}
          takeNumber={takeNumber}
          // Self mode: this panel stands in for the gate, so it must carry both
          // ways out — start the take, or go back to the read-in.
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
        sensitiveZones={pv.sensitive_zones}
        sections={pv.episode_sections}
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
      energy={displayedEnergy}
      approvedEnergy={handshake.approved}
      suggestion={handshake.pending}
      lapsedSuggestion={handshake.lapsed}
      onApproveEnergy={onApproveEnergy}
      heroId={heroId}
      onPickHero={setHeroId}
      energyReordersSection={energyReordersSection}
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

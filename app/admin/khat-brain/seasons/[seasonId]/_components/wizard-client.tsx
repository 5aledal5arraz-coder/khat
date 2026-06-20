"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  Sparkles,
  Loader2,
  Hand,
  ListChecks,
  Lock,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react"
import type {
  KhatMapSeason,
  KhatMapEpisodeCandidate,
  KhatMapGuestCandidate,
} from "@/types/khat-map"
import { KHAT_EPISODE_TYPE_LABEL } from "@/types/khat-map"
import {
  acceptCardAction,
  alternativeAction,
  autoCompleteSeasonAction,
  generateBatchAction,
  lockSeasonTopicsAction,
  regenerateSlotAction,
  rejectCardAction,
  removeManualTopicAction,
  switchV2ModeAction,
  undoV2DecisionAction,
  type AlternativeMode,
  type SeasonProgress,
} from "../../actions"
import { WizardCard, type PendingCard } from "./card"
import { AddTopicModal } from "./add-topic-modal"
import { AlternativeSheet } from "./alternative-sheet"
import { UndoToast } from "./undo-toast"
import { SeasonOverview, type AcceptedPair } from "./season-overview"
import { GuestInjectButton } from "./guest-inject-sheet"
import { CompletionBanner } from "./completion-banner"
import { EpisodeEditModal } from "./episode-edit-modal"
import { ProductionStatusPanel } from "./production-status"
import {
  detectMissingRoles,
  type KhatMapMustIncludeRole,
} from "@/lib/khat-map/v2/completion"
import type { BatchCard } from "@/lib/khat-map/v2/types"
import type { ProductionStatusRow } from "../../actions"

export function WizardClient({
  season,
  progress,
  initialPending,
  initialAccepted,
  initialProduction,
  legacyBatchEnabled = false,
}: {
  season: KhatMapSeason
  progress: SeasonProgress | null
  initialPending: Array<{
    topic: KhatMapEpisodeCandidate
    guest: KhatMapGuestCandidate | null
  }>
  initialAccepted: Array<{
    topic: KhatMapEpisodeCandidate
    guest: KhatMapGuestCandidate | null
  }>
  initialProduction: ProductionStatusRow[]
  /**
   * Cleanup Phase A — legacy "Generate Batch" CTA visibility.
   * Default false: the empty-state CTA points the user at the Hybrid
   * Generator above the wizard. Set KHAT_LEGACY_BATCH_ENABLED=true to
   * re-expose the legacy quick-batch button (no market intelligence).
   */
  legacyBatchEnabled?: boolean
}) {
  const router = useRouter()
  const [pending, setPending] = useState<PendingCard[]>(
    initialPending.map((p) => ({ topic: p.topic, guest: p.guest })),
  )
  // Sync server-rendered initialPending into local state when the page
  // is router.refresh()'d after a topic generation. Without this, the
  // wizard would stay frozen with whatever was in `pending` at mount
  // and the new candidates would only appear on a hard reload.
  // Strategy: append any server-rendered card whose topic.id we don't
  // already have locally — preserves any in-flight UI state and avoids
  // a flash when the operator was mid-review.
  const seenTopicIdsRef = useRef<Set<string>>(
    new Set(initialPending.map((p) => p.topic.id)),
  )
  useEffect(() => {
    const incoming: PendingCard[] = []
    for (const p of initialPending) {
      if (!seenTopicIdsRef.current.has(p.topic.id)) {
        seenTopicIdsRef.current.add(p.topic.id)
        incoming.push({ topic: p.topic, guest: p.guest })
      }
    }
    if (incoming.length > 0) {
      setPending((prev) => [...prev, ...incoming])
    }
  }, [initialPending])
  const [accepted, setAccepted] = useState<AcceptedPair[]>(initialAccepted)
  const [acceptedCount, setAcceptedCount] = useState<number>(
    progress?.accepted_count ?? 0,
  )
  const target = progress?.target ?? season.v2_episode_target ?? 10
  // Phase A/B redesign — gate guest-related UI on the wizard stage.
  // Phase A === topics-only: no guest blocks on cards, no guest-inject
  // button, no auto-guest suggestions. Lock-topics CTA lives in
  // season-overview.tsx.
  const isPhaseA = season.wizard_stage === "topics"
  const [batchIndex, setBatchIndex] = useState<number>(
    (progress?.last_decision_id ? 1 : 0) + 1,
  )
  const [genPending, startGen] = useTransition()
  const [actionPending, startAction] = useTransition()
  // CR-1 — Track a SET of in-flight card ids (was a single string). The
  // previous shape blocked accept #2..#N when the operator clicked accept
  // in rapid succession across different cards, because every handler
  // early-returned on `if (cardPendingId) return`. Now we only block when
  // the SAME card is double-clicked while its first request is in flight.
  // Concurrent accepts on different cards proceed in parallel.
  const [cardPendingIds, setCardPendingIds] = useState<Set<string>>(() => new Set())
  const addPending = (id: string) =>
    setCardPendingIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  const removePending = (id: string) =>
    setCardPendingIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  const [altForCard, setAltForCard] = useState<PendingCard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lockPending, startLock] = useTransition()

  // Manual mode — operator-authored topics.
  const [showAddTopic, setShowAddTopic] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [topicRemovePending, startTopicRemove] = useTransition()

  const handleManualAdded = (topic: KhatMapEpisodeCandidate) => {
    setShowAddTopic(false)
    seenTopicIdsRef.current.add(topic.id)
    setAccepted((a) => [...a, { topic, guest: null }])
    setAcceptedCount((n) => n + 1)
  }

  const handleManualRemove = (topicId: string) => {
    if (topicRemovePending) return
    setError(null)
    setRemovingId(topicId)
    startTopicRemove(async () => {
      const res = await removeManualTopicAction({ seasonId: season.id, topicCandidateId: topicId })
      setRemovingId(null)
      if (!res.success) {
        setError(res.error)
        return
      }
      setAccepted((a) => a.filter((p) => p.topic.id !== topicId))
      setAcceptedCount((n) => Math.max(0, n - 1))
    })
  }

  const handleLockTopics = useCallback(() => {
    if (lockPending) return
    setError(null)
    startLock(async () => {
      const res = await lockSeasonTopicsAction({ seasonId: season.id })
      if (!res.success) {
        setError(res.error)
        return
      }
      // Successful lock flips wizard_stage to "topics_locked" — reload
      // so the Phase B surface (introduced in Step 7) takes over.
      router.refresh()
    })
  }, [lockPending, router, season.id])

  // Undo toast state
  const [undoState, setUndoState] = useState<{
    decisionId: string
    label: string
    createdAt: number
    restoredCard: PendingCard // what we restore on undo
  } | null>(null)
  const [undoPending, startUndo] = useTransition()

  // PR4 — strict-exhaustion banner state
  const [strictExhausted, setStrictExhausted] = useState<string | null>(null)
  const [switchPending, startSwitch] = useTransition()

  // PR4 — completion (auto-fill) state
  const [autoCompletePending, startAutoComplete] = useTransition()

  // PR4 — Overview edit modal state
  const [editTarget, setEditTarget] = useState<KhatMapEpisodeCandidate | null>(null)
  const [regenPendingFor, setRegenPendingFor] = useState<string | null>(null)
  const [regenTransPending, startRegen] = useTransition()

  const complete = acceptedCount >= target

  // Derive missing roles + remaining slots from the client state — no
  // server round-trip needed. Updates instantly as the admin accepts.
  const remainingSlots = Math.max(0, target - acceptedCount)
  const missingRoles: KhatMapMustIncludeRole[] = detectMissingRoles(
    accepted.map((p) => ({
      episode_type: p.topic.episode_type,
      topic_domain: p.topic.topic_domain,
      risk_level: p.topic.risk_level,
    })),
  )
  const showCompletionBanner =
    season.v2_mode !== "manual" &&
    !complete &&
    remainingSlots > 0 &&
    remainingSlots <= 2 &&
    missingRoles.length > 0

  const handleGenerate = useCallback(() => {
    setError(null)
    setStrictExhausted(null)
    startGen(async () => {
      const res = await generateBatchAction({ seasonId: season.id, size: 4 })
      if (!res.success) {
        if (res.code === "ANGLE_BANK_EXHAUSTED") {
          setStrictExhausted(res.error)
          return
        }
        setError(res.error)
        return
      }
      const next: PendingCard[] = res.data.cards.map((c) => ({
        topic: c.topic_candidate,
        guest: c.guest_candidate,
        why_now: c.why_now,
        why_fit_you: c.why_fit_you,
        editorial_score: c.editorial_score,
        taste_alignment: c.taste_alignment,
        explainability: c.explainability ?? null,
      }))
      setPending((prev) => [...prev, ...next])
      setBatchIndex(res.data.batch_index + 1)
    })
  }, [season.id])

  const batchCardToPending = (c: BatchCard): PendingCard => ({
    topic: c.topic_candidate,
    guest: c.guest_candidate,
    why_now: c.why_now,
    why_fit_you: c.why_fit_you,
    editorial_score: c.editorial_score,
    taste_alignment: c.taste_alignment,
    explainability: c.explainability ?? null,
  })

  // Guest injection — returned 3 cards jump to TOP of stack (PR4 decision).
  const handleGuestInjected = (cards: BatchCard[]) => {
    setPending((prev) => [...cards.map(batchCardToPending), ...prev])
  }

  // Intelligent completion — generate one card per missing role, prepend.
  const handleAutoComplete = () => {
    setError(null)
    setStrictExhausted(null)
    startAutoComplete(async () => {
      const res = await autoCompleteSeasonAction(season.id)
      if (!res.success) {
        if (res.code === "ANGLE_BANK_EXHAUSTED") {
          setStrictExhausted(res.error)
          return
        }
        setError(res.error)
        return
      }
      setPending((prev) => [...res.data.cards.map(batchCardToPending), ...prev])
    })
  }

  // Strict-mode hard-stop → one-click switch to Guided.
  const handleSwitchToGuided = () => {
    startSwitch(async () => {
      const res = await switchV2ModeAction({
        seasonId: season.id,
        mode: "guided",
      })
      if (!res.success) {
        setError(res.error)
        return
      }
      setStrictExhausted(null)
      // Hard refresh so the server re-reads season.v2_mode.
      router.refresh()
    })
  }

  // Overview — regenerate one accepted slot. Old card retires; new card
  // enters the pending stack and must be accepted to replace the old.
  const handleRegenerate = (topicId: string) => {
    setError(null)
    setRegenPendingFor(topicId)
    startRegen(async () => {
      const res = await regenerateSlotAction({
        seasonId: season.id,
        topicCandidateId: topicId,
      })
      setRegenPendingFor(null)
      if (!res.success) {
        if (res.code === "ANGLE_BANK_EXHAUSTED") {
          setStrictExhausted(res.error)
          return
        }
        setError(res.error)
        return
      }
      // The old candidate is now rejected; drop it from the accepted list
      // and decrement the counter so the admin must accept its replacement.
      setAccepted((a) => a.filter((p) => p.topic.id !== topicId))
      setAcceptedCount((n) => Math.max(0, n - 1))
      if (res.data.card) {
        setPending((prev) => [batchCardToPending(res.data.card!), ...prev])
      }
    })
  }

  const handleEditSaved = (updated: KhatMapEpisodeCandidate) => {
    setAccepted((a) =>
      a.map((p) => (p.topic.id === updated.id ? { ...p, topic: updated } : p)),
    )
    setEditTarget(null)
  }

  const removeFromPending = (topicId: string): PendingCard | null => {
    let removed: PendingCard | null = null
    setPending((prev) => {
      const out: PendingCard[] = []
      for (const c of prev) {
        if (c.topic.id === topicId) removed = c
        else out.push(c)
      }
      return out
    })
    return removed
  }

  const handleAccept = (card: PendingCard) => {
    // CR-1 — only block if THIS specific card is already in flight (was:
    // any card in flight, which made parallel accepts impossible).
    if (cardPendingIds.has(card.topic.id)) return
    setError(null)
    addPending(card.topic.id)
    startAction(async () => {
      const res = await acceptCardAction({
        seasonId: season.id,
        topicCandidateId: card.topic.id,
        guestCandidateId: card.guest?.id ?? null,
        batchIndex: batchIndex - 1,
      })
      removePending(card.topic.id)
      if (!res.success) {
        setError(res.error)
        return
      }
      const removed = removeFromPending(card.topic.id)
      setAcceptedCount((n) => n + 1)
      setAccepted((a) => [...a, { topic: card.topic, guest: card.guest }])
      if (removed) {
        setUndoState({
          decisionId: res.data.decisionId,
          label: `قُبلت: ${card.topic.working_title}`,
          createdAt: Date.now(),
          restoredCard: removed,
        })
      }
    })
  }

  const handleReject = (card: PendingCard) => {
    if (cardPendingIds.has(card.topic.id)) return
    setError(null)
    addPending(card.topic.id)
    startAction(async () => {
      const res = await rejectCardAction({
        seasonId: season.id,
        topicCandidateId: card.topic.id,
        guestCandidateId: card.guest?.id ?? null,
        batchIndex: batchIndex - 1,
      })
      removePending(card.topic.id)
      if (!res.success) {
        setError(res.error)
        return
      }
      const removed = removeFromPending(card.topic.id)
      if (removed) {
        setUndoState({
          decisionId: res.data.decisionId,
          label: `رُفضت: ${card.topic.working_title}`,
          createdAt: Date.now(),
          restoredCard: removed,
        })
      }
    })
  }

  const handleAlternative = (mode: AlternativeMode) => {
    const card = altForCard
    if (!card) return
    setError(null)
    setAltForCard(null)
    addPending(card.topic.id)
    startAction(async () => {
      const res = await alternativeAction({
        seasonId: season.id,
        topicCandidateId: card.topic.id,
        guestCandidateId: card.guest?.id ?? null,
        batchIndex: batchIndex - 1,
        mode,
      })
      removePending(card.topic.id)
      if (!res.success) {
        setError(res.error)
        return
      }
      const removed = removeFromPending(card.topic.id)
      // If the action produced a replacement card, inject it at the top.
      if (res.data.replacement_card) {
        const rc = res.data.replacement_card
        setPending((prev) => [
          {
            topic: rc.topic_candidate,
            guest: rc.guest_candidate,
            why_now: rc.why_now,
            why_fit_you: rc.why_fit_you,
            editorial_score: rc.editorial_score,
            taste_alignment: rc.taste_alignment,
            explainability: rc.explainability ?? null,
          },
          ...prev,
        ])
      }
      if (removed) {
        setUndoState({
          decisionId: res.data.decisionId,
          label: `رُفضت: ${card.topic.working_title}`,
          createdAt: Date.now(),
          restoredCard: removed,
        })
      }
    })
  }

  const handleUndo = () => {
    if (!undoState) return
    startUndo(async () => {
      const res = await undoV2DecisionAction(undoState.decisionId)
      if (!res.success) {
        setError(res.error)
        setUndoState(null)
        return
      }
      // Restore the card to pending. If it was an accept, decrement count.
      setPending((prev) => [undoState.restoredCard, ...prev])
      if (undoState.label.startsWith("قُبلت")) {
        setAcceptedCount((n) => Math.max(0, n - 1))
        setAccepted((prev) =>
          prev.filter((p) => p.topic.id !== undoState.restoredCard.topic.id),
        )
      }
      setUndoState(null)
    })
  }

  const progressPct = target > 0 ? Math.min(100, (acceptedCount / target) * 100) : 0

  // ─── Complete state → show Overview ────────────────────────────────────────
  if (complete && pending.length === 0) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-background">
        <div className="mx-auto max-w-3xl px-6 pt-8 pb-16">
          <TopBar
            seasonName={season.name}
            acceptedCount={acceptedCount}
            target={target}
            progressPct={progressPct}
          />
          <div className="mt-8">
            <SeasonOverview
              pairs={accepted}
              target={target}
              onEdit={(id) => {
                const pair = accepted.find((p) => p.topic.id === id)
                if (pair) setEditTarget(pair.topic)
              }}
              onRegenerate={(id) => {
                if (regenTransPending) return
                handleRegenerate(id)
              }}
              phaseA={isPhaseA}
              lockPending={lockPending}
              onLockTopics={handleLockTopics}
            />
          </div>
          <div className="mt-8">
            <ProductionStatusPanel
              seasonId={season.id}
              initialRows={initialProduction}
            />
          </div>
          {regenPendingFor && (
            <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-3 text-center text-[12px] text-primary">
              نولّد بديلاً… سيظهر في قائمة الدُفعات.
            </div>
          )}
          {editTarget && (
            <EpisodeEditModal
              open={true}
              seasonId={season.id}
              topic={editTarget}
              onClose={() => setEditTarget(null)}
              onSaved={() => {
                // Optimistic: apply local patch from the form state on close.
                // The server has persisted already; router.refresh catches any
                // divergence on next navigation.
                const updated = editTarget
                handleEditSaved(updated)
              }}
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="mx-auto max-w-2xl px-6 pt-6 pb-24">
        <TopBar
          seasonName={season.name}
          acceptedCount={acceptedCount}
          target={target}
          progressPct={progressPct}
        />

        {/* Phase A banner — visible whenever the season is in topics-only
            mode. Surfaces the lock CTA as soon as the operator accepts
            at least one topic; doesn't wait for the target count. */}
        {isPhaseA && (
          <div className="mt-4 rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-primary/80">
                  المرحلة الأولى — المواضيع
                </div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-foreground/80">
                  اختر مواضيع موسمك واعتمدها. الضيوف ستأتي بعد قفل المواضيع
                  في المرحلة الثانية ({acceptedCount} موضوع معتمد).
                </p>
              </div>
              <button
                type="button"
                onClick={handleLockTopics}
                disabled={lockPending || acceptedCount === 0}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[12px] font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {lockPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    قفل…
                  </>
                ) : (
                  <>
                    <Lock className="h-3.5 w-3.5" />
                    اقفل المواضيع
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-[12px] text-rose-700">
            {error}
          </div>
        )}

        {strictExhausted && (
          <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-amber-700">
              بنك الزوايا نفد
            </div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-amber-700/90">
              {strictExhausted}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleSwitchToGuided}
                disabled={switchPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-[12px] font-bold text-amber-950 hover:opacity-90 disabled:opacity-60"
              >
                {switchPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                بدّل إلى &quot;موجّه&quot;
              </button>
              <button
                type="button"
                onClick={() => setStrictExhausted(null)}
                className="rounded-lg px-3 py-1.5 text-[12px] text-amber-700/80 hover:text-amber-700"
              >
                إخفاء
              </button>
            </div>
          </div>
        )}

        {showCompletionBanner && (
          <div className="mt-4">
            <CompletionBanner
              missingRoles={missingRoles}
              remainingSlots={remainingSlots}
              pending={autoCompletePending}
              onAutoComplete={handleAutoComplete}
            />
          </div>
        )}

        {/* Manual mode — operator authors topics by hand (Phase A only;
            after lock, Phase B per-episode discovery takes over). */}
        {season.v2_mode === "manual" && isPhaseA && !complete && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Hand className="h-4 w-4 text-muted-foreground" />
                مواضيع الموسم
                <span className="text-[11px] font-normal text-muted-foreground tabular-nums">
                  ({acceptedCount}/{target})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowAddTopic(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-[12px] font-bold text-background transition-opacity hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" />
                أضف موضوعاً
              </button>
            </div>

            {accepted.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/50 bg-card/20 p-8 text-center">
                <Hand className="mx-auto h-6 w-6 text-muted-foreground" />
                <h3 className="mt-3 text-base font-semibold">الوضع اليدوي</h3>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  أنت تقود الموسم. اضغط «أضف موضوعاً» لبناء حلقاتك واحدةً تلو
                  الأخرى، ثم اقفل المواضيع للانتقال إلى اختيار الضيوف.
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {accepted.map((p, i) => (
                  <li
                    key={p.topic.id}
                    className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/30 p-3"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted/50 text-[11px] font-bold tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold">
                        {p.topic.working_title}
                      </div>
                      {p.topic.episode_type && (
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {KHAT_EPISODE_TYPE_LABEL[p.topic.episode_type]}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditTarget(p.topic)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      title="تعديل"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleManualRemove(p.topic.id)}
                      disabled={topicRemovePending && removingId === p.topic.id}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-700 disabled:opacity-50"
                      title="حذف"
                    >
                      {topicRemovePending && removingId === p.topic.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Empty pending + not complete + not manual → Generate CTA.
            Cleanup Phase A: when the Hybrid Generator is the default
            path, the empty-state CTA points the user up to the Hybrid
            button. The legacy quick-batch button is hidden behind a
            flag (KHAT_LEGACY_BATCH_ENABLED). */}
        {pending.length === 0 &&
          !complete &&
          season.v2_mode !== "manual" && (
            <div className="mt-8 rounded-3xl border border-border/40 bg-card/30 p-8 text-center">
              <Sparkles className="mx-auto h-6 w-6 text-primary" />
              <h3 className="mt-3 text-base font-semibold">
                {acceptedCount === 0
                  ? "لنبدأ — اضغط «المولّد الهجين» في الأعلى"
                  : "ابدأ الدفعة التالية من الأعلى"}
              </h3>
              <p className="mt-1 text-[12px] text-muted-foreground">
                المولّد الهجين يقترح حلقات مدفوعة بإشارات السوق + التفكير
                الأصيل + ذاكرة الأداء. هذه هي المسار الافتراضي للموسم.
              </p>
              {legacyBatchEnabled && (
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={genPending}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl border border-border/50 bg-card/40 px-4 py-2 text-[12px] font-medium text-muted-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                  title="Legacy generator — does NOT use market intelligence"
                >
                  {genPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      نُولّد (legacy)…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      Legacy quick batch — no market intelligence
                    </>
                  )}
                </button>
              )}
            </div>
          )}

        {/* Card stack */}
        {pending.length > 0 && (
          <div className="mt-6 space-y-3">
            {pending.map((card) => (
              <WizardCard
                key={card.topic.id}
                card={card}
                batchIndex={batchIndex - 1}
                pending={cardPendingIds.has(card.topic.id) && actionPending}
                onAccept={() => handleAccept(card)}
                onReject={() => handleReject(card)}
                onAlternative={() => setAltForCard(card)}
                hideGuestBlock={isPhaseA}
              />
            ))}
            {/* After all 4 are reviewed, surface the "next batch" CTA
                inline — Cleanup Phase A: legacy-flag-gated. */}
            {!genPending && !actionPending && legacyBatchEnabled && (
              <button
                type="button"
                onClick={handleGenerate}
                className="w-full rounded-xl border border-dashed border-border/50 bg-card/20 p-3 text-[11.5px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                title="Legacy generator — does NOT use market intelligence"
              >
                <ListChecks className="mr-2 inline h-3.5 w-3.5" />
                Legacy: زد ٤ خيارات (no market intel)
              </button>
            )}
          </div>
        )}
      </div>

      {/* Floating guest-inject button — Phase A suppresses it entirely;
          guests live in Phase B per-episode discovery. */}
      {!isPhaseA && season.v2_mode !== "manual" && (
        <GuestInjectButton
          seasonId={season.id}
          batchIndex={batchIndex - 1}
          disabled={actionPending || genPending || autoCompletePending}
          onInjected={handleGuestInjected}
        />
      )}

      {/* Alternative sheet */}
      <AlternativeSheet
        open={altForCard !== null}
        hasGuest={altForCard?.guest !== null && altForCard?.guest !== undefined}
        pending={actionPending}
        onClose={() => setAltForCard(null)}
        onChoose={handleAlternative}
      />

      {/* Undo toast */}
      {undoState && (
        <UndoToast
          decisionId={undoState.decisionId}
          label={undoState.label}
          createdAt={undoState.createdAt}
          pending={undoPending}
          onUndo={handleUndo}
          onDismiss={() => setUndoState(null)}
        />
      )}

      {/* Manual mode — add-topic + edit modals */}
      <AddTopicModal
        open={showAddTopic}
        seasonId={season.id}
        onClose={() => setShowAddTopic(false)}
        onAdded={handleManualAdded}
      />
      {editTarget && (
        <EpisodeEditModal
          open
          seasonId={season.id}
          topic={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null)
            router.refresh()
          }}
        />
      )}

      {/* Light refresh on idle so the server's progress row stays fresh */}
      <button
        aria-hidden="true"
        className="sr-only"
        onClick={() => router.refresh()}
      />
    </div>
  )
}

function TopBar({
  seasonName,
  acceptedCount,
  target,
  progressPct,
}: {
  seasonName: string
  acceptedCount: number
  target: number
  progressPct: number
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <Link
          href="/admin/khat-brain/seasons/new"
          className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="h-3.5 w-3.5" />
          موسم جديد
        </Link>
        <div className="text-[11px] tabular-nums text-muted-foreground">
          {acceptedCount} / {target}
        </div>
      </div>
      <div className="mt-3">
        <h1 className="text-lg font-bold">{seasonName}</h1>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border/30">
        <div
          className="h-full bg-primary transition-[width] duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </div>
  )
}

"use client"

/**
 * Phase B redesign — per-episode guest discovery panel.
 *
 * Rendered when `season.wizard_stage ∈ {topics_locked, guests, complete}`.
 * For each approved/locked episode candidate, shows:
 *   - the topic title + stale-discovery banner (if applicable)
 *   - a "ابحث عن ضيف لهذه الحلقة" CTA when no candidates exist yet
 *   - a list of GuestCandidateCard rows when candidates have arrived
 *
 * Discovery is jobs-driven — clicking the CTA enqueues the pipeline,
 * then the operator refreshes (router.refresh()) once the worker drains.
 * The panel does not poll; that's a future enhancement.
 */

import { useCallback, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, RefreshCw, Search, UserRoundCheck } from "lucide-react"
import type {
  KhatMapEpisodeCandidate,
  KhatMapGuestCandidate,
} from "@/types/khat-map"
import {
  assignDiscoveredGuestToEpisodeAction,
  listDiscoveryCandidatesForEpisodeAction,
  startGuestDiscoveryForEpisodeAction,
} from "../../actions"
import { GuestCandidateCard, type GuestCandidateCardData } from "./guest-candidate-card"

export interface PhaseBEpisode {
  topic: KhatMapEpisodeCandidate
  assignedGuest: KhatMapGuestCandidate | null
}

export function PhaseBPanel({
  seasonId,
  episodes,
}: {
  seasonId: string
  episodes: PhaseBEpisode[]
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-primary/80">
          المرحلة الثانية — الضيوف
        </div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-foreground/80">
          ابحث عن ضيف لكل حلقة بشكل مستقل. النظام يستخدم فلاتر الموسم
          الصارمة (جنس وجنسية) ويبني الاستعلامات على عنوان الحلقة.
        </p>
      </div>

      {episodes.map((ep) => (
        <EpisodeBlock key={ep.topic.id} seasonId={seasonId} ep={ep} />
      ))}
    </div>
  )
}

function EpisodeBlock({
  seasonId,
  ep,
}: {
  seasonId: string
  ep: PhaseBEpisode
}) {
  const router = useRouter()
  const [searchPending, startSearch] = useTransition()
  const [assignPendingId, setAssignPendingId] = useState<string | null>(null)
  const [assignTransPending, startAssign] = useTransition()
  const [candidates, setCandidates] = useState<GuestCandidateCardData[] | null>(
    null,
  )
  const [loadPending, startLoad] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const isStale = Boolean(ep.topic.discovery_stale_at)

  const handleStartDiscovery = useCallback(() => {
    setError(null)
    startSearch(async () => {
      const res = await startGuestDiscoveryForEpisodeAction({
        seasonId,
        episodeCandidateId: ep.topic.id,
      })
      if (!res.success) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }, [ep.topic.id, router, seasonId])

  const handleLoadCandidates = useCallback(() => {
    setError(null)
    startLoad(async () => {
      const res = await listDiscoveryCandidatesForEpisodeAction({
        episodeCandidateId: ep.topic.id,
      })
      if (!res.success) {
        setError(res.error)
        return
      }
      setCandidates(res.data.candidates)
    })
  }, [ep.topic.id])

  const handleAssign = useCallback(
    (candidateId: string) => {
      setError(null)
      setAssignPendingId(candidateId)
      startAssign(async () => {
        const res = await assignDiscoveredGuestToEpisodeAction({
          seasonId,
          episodeCandidateId: ep.topic.id,
          discoveryCandidateId: candidateId,
        })
        if (!res.success) {
          setError(res.error)
          setAssignPendingId(null)
          return
        }
        // Refresh so the panel re-renders with the assigned guest.
        router.refresh()
      })
    },
    [ep.topic.id, router, seasonId],
  )

  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
      {/* Topic header */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold">{ep.topic.working_title}</h3>
          {ep.topic.hook && (
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              {ep.topic.hook}
            </p>
          )}
        </div>
        {ep.assignedGuest && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-300">
            <UserRoundCheck className="h-3 w-3" />
            {ep.assignedGuest.full_name}
          </span>
        )}
      </div>

      {/* Stale-discovery banner */}
      {isStale && (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[11.5px] text-amber-200/90">
          عُدِّل الموضوع بعد آخر بحث — نتائج الاكتشاف الحالية لم تعد
          مطابقة. اضغط «أعِد البحث» لتحديث الاقتراحات.
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-[11.5px] text-rose-300">
          {error}
        </div>
      )}

      {/* Actions row */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleStartDiscovery}
          disabled={searchPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 px-3 py-1.5 text-[12px] font-semibold text-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {searchPending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ابتدأنا…
            </>
          ) : isStale ? (
            <>
              <RefreshCw className="h-3.5 w-3.5" />
              أعِد البحث
            </>
          ) : (
            <>
              <Search className="h-3.5 w-3.5" />
              ابحث عن ضيف لهذه الحلقة
            </>
          )}
        </button>
        <button
          type="button"
          onClick={handleLoadCandidates}
          disabled={loadPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loadPending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              نحمّل…
            </>
          ) : (
            <>اعرض المرشحين</>
          )}
        </button>
      </div>

      {/* Candidate cards */}
      {candidates && candidates.length > 0 && (
        <div className="space-y-2">
          {candidates.map((c) => (
            <GuestCandidateCard
              key={c.id}
              candidate={c}
              pending={assignPendingId === c.id && assignTransPending}
              onAssign={() => handleAssign(c.id)}
              onSkip={() => {
                // Local-only skip — removes the row from the list. The
                // candidate stays in the DB as `proposed` so it can be
                // reviewed later from the legacy /admin/discovery page.
                setCandidates((prev) =>
                  prev ? prev.filter((p) => p.id !== c.id) : prev,
                )
              }}
            />
          ))}
        </div>
      )}
      {candidates && candidates.length === 0 && (
        <p className="text-[11.5px] text-muted-foreground/70">
          لا توجد اقتراحات حتى الآن — ابدأ بحثًا جديدًا، ثم اعرض المرشحين
          بعد بضع دقائق.
        </p>
      )}
    </div>
  )
}

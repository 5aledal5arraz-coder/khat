"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type { EpisodeReview } from "@/lib/studio/episode-review"
import type { StudioProject } from "@/lib/studio/projects"
import type { TranscriptionProgress } from "@/lib/studio/transcription-progress"
import { useSession } from "./session-context"

/**
 * Studio 3-phase journey, Step 4 — the Phase-2 REVIEW + APPROVAL client state.
 *
 * This is the sibling of episode-map-context and reuses its exact shape: the
 * review is a BACKGROUND JOB (whisper re-transcribes the full edited cut —
 * minutes, not seconds), so generation is a trigger + poll:
 *   generate() → POST .../episode-review → { jobId }
 *   then poll GET .../episode-review/status?jobId until the review appears or
 *   the job fails. The live elapsed counter is the wall-clock pattern the map
 *   uses (a start timestamp, not a tick, so a throttled tab still reads true).
 *
 * On top of the map's shape it also carries the PROJECT (the journey spine)
 * so the stepper + Phase-3 gate can render, and the APPROVE action that
 * transitions `mapped → reviewed`.
 *
 * Only hydrates for the edited cut of a linked project — for every other
 * session (raw map, YouTube, legacy, standalone edited upload) it resolves to
 * "no project" and the review journey does not render.
 */

export type EpisodeReviewStatus = "idle" | "running" | "ready" | "error"

interface EpisodeReviewContextValue {
  /** The linked project, or null when this session is not part of one. */
  project: StudioProject | null
  /** True once the initial project/review hydration has settled. */
  hydrated: boolean
  /** Convenience: project != null. */
  isProjectLinked: boolean
  /** When Phase 1 (the map) was generated (for the stepper). */
  mappedAt: string | null
  /** When Phase 2 (this review) last ran (for the stepper). */
  reviewedAt: string | null

  review: EpisodeReview | null
  status: EpisodeReviewStatus
  error: string
  /** Wall-clock seconds since the current review run started (0 when idle). */
  elapsedSeconds: number
  /** Live progress heartbeat (stage / % / chunk / ETA); null until first report. */
  progress: TranscriptionProgress | null
  /** Kick off (or re-run) the review job. No-op while already running. */
  generate: () => Promise<void>

  approving: boolean
  approveError: string
  /** Approve the review → transitions the project `mapped → reviewed`. */
  approve: () => Promise<void>
}

const EpisodeReviewContext = createContext<EpisodeReviewContextValue | null>(null)

export function useEpisodeReview() {
  const ctx = useContext(EpisodeReviewContext)
  if (!ctx)
    throw new Error("useEpisodeReview must be used within EpisodeReviewProvider")
  return ctx
}

/** How often to poll the review job while a run is in flight. */
const POLL_INTERVAL_MS = 4000

export function EpisodeReviewProvider({ children }: { children: ReactNode }) {
  const { session } = useSession()
  const sessionId = session.id

  // Only the edited cut of a project has a Phase-2 review journey.
  const isReviewCandidate =
    session.source === "audio" && session.audio_stage === "edited"

  const [project, setProject] = useState<StudioProject | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [mappedAt, setMappedAt] = useState<string | null>(null)
  const [reviewedAt, setReviewedAt] = useState<string | null>(null)

  const [review, setReview] = useState<EpisodeReview | null>(null)
  const [status, setStatus] = useState<EpisodeReviewStatus>("idle")
  const [error, setError] = useState("")
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [progress, setProgress] = useState<TranscriptionProgress | null>(null)

  const [approving, setApproving] = useState(false)
  const [approveError, setApproveError] = useState("")

  const startedAtRef = useRef<number | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Stop the poll interval ONLY. Deliberately does not touch `startedAtRef`:
  // it's called mid-run (in generate(), right before installing the new poll),
  // so nulling the start time here would freeze the elapsed counter and clobber
  // the re-attach start time. The counter naturally stops when `status` leaves
  // "running" (its effect's cleanup clears the 1s tick).
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  // Poll the job/review until it resolves. Shared by generate() (after the POST)
  // and the on-load re-attach, so a refreshed tab resumes the exact same loop.
  // Detecting a failed job (not just a missing review) is what stops the counter
  // from ticking forever.
  const startPolling = useCallback(
    (jobId: string) => {
      stopPolling()
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(
            `/api/admin/studio/${sessionId}/episode-review/status?jobId=${encodeURIComponent(jobId)}`,
          )
          if (!res.ok) return
          const json = await res.json()
          // Surface the live heartbeat (stage / % / chunk / ETA) for the bar.
          setProgress((json.progress as TranscriptionProgress | null) ?? null)
          if (json.review) {
            setReview(json.review as EpisodeReview)
            setReviewedAt(new Date().toISOString())
            setStatus("ready")
            stopPolling()
            return
          }
          if (["failed", "dead", "cancelled"].includes(json.jobStatus)) {
            setStatus("error")
            setError(
              json.jobError ||
                "فشلت مراجعة المرحلة ٢. تأكّد أن عامل المهام (worker) يعمل.",
            )
            stopPolling()
          }
        } catch {
          // Transient network blip — keep polling.
        }
      }, POLL_INTERVAL_MS)
    },
    [sessionId, stopPolling],
  )

  // Hydrate the project + any already-generated review on open. When no review
  // exists yet, RE-ATTACH to an in-flight job (the jobId lived only in React
  // state and was lost on refresh) so the progress bar resumes instead of the
  // UI falling back to idle and inviting a duplicate re-transcription.
  useEffect(() => {
    if (!isReviewCandidate) {
      setHydrated(true)
      return
    }
    let cancelled = false
    Promise.all([
      fetch(`/api/admin/studio/${sessionId}/project`)
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
      fetch(`/api/admin/studio/${sessionId}/episode-review/status`)
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
    ]).then(([journey, reviewStatus]) => {
      if (cancelled) return
      if (journey) {
        setProject((journey.project as StudioProject | null) ?? null)
        setMappedAt((journey.mappedAt as string | null) ?? null)
        setReviewedAt((journey.reviewedAt as string | null) ?? null)
      }
      if (reviewStatus?.review) {
        setReview(reviewStatus.review as EpisodeReview)
        setStatus("ready")
      } else if (
        reviewStatus?.jobId &&
        (reviewStatus.jobStatus === "pending" || reviewStatus.jobStatus === "running")
      ) {
        // Resume the elapsed counter from the job's real start time (honest),
        // falling back to now if it's missing/unparseable.
        const parsed =
          typeof reviewStatus.startedAt === "string"
            ? Date.parse(reviewStatus.startedAt)
            : NaN
        const startedAtMs = Number.isNaN(parsed) ? Date.now() : parsed
        startedAtRef.current = startedAtMs
        setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)))
        setProgress((reviewStatus.progress as TranscriptionProgress | null) ?? null)
        setStatus("running")
        startPolling(reviewStatus.jobId as string)
      }
      setHydrated(true)
    })
    return () => {
      cancelled = true
    }
  }, [sessionId, isReviewCandidate, startPolling])

  // Live elapsed counter — the only honest "still working" signal during the
  // minutes-long re-transcription. Driven off a wall-clock start time.
  useEffect(() => {
    if (status !== "running") return
    const id = setInterval(() => {
      const startedAt = startedAtRef.current
      if (startedAt != null) {
        setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000))
      }
    }, 1000)
    return () => clearInterval(id)
  }, [status])

  // Cleanup any live poll on unmount.
  useEffect(() => stopPolling, [stopPolling])

  const generate = useCallback(async () => {
    if (status === "running") return
    setError("")
    setStatus("running")
    startedAtRef.current = Date.now()
    setElapsedSeconds(0)
    setProgress(null)

    try {
      const res = await fetch(
        `/api/admin/studio/${sessionId}/episode-review`,
        { method: "POST" },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setStatus("error")
        setError(data.error || "تعذّر بدء مراجعة المرحلة ٢")
        stopPolling()
        return
      }
      // The POST dedups server-side: a fresh enqueue OR an already-running job
      // for this edited session both come back as `{ jobId }` — we just adopt it.
      startPolling(data.jobId as string)
    } catch {
      setStatus("error")
      setError("حدث خطأ في الاتصال")
      stopPolling()
    }
  }, [sessionId, status, stopPolling, startPolling])

  const approve = useCallback(async () => {
    if (approving) return
    setApproveError("")
    setApproving(true)
    try {
      const res = await fetch(
        `/api/admin/studio/${sessionId}/episode-review/approve`,
        { method: "POST" },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setApproveError(data.error || "تعذّر اعتماد المراجعة")
        return
      }
      if (data.project) setProject(data.project as StudioProject)
    } catch {
      setApproveError("حدث خطأ في الاتصال")
    } finally {
      setApproving(false)
    }
  }, [sessionId, approving])

  return (
    <EpisodeReviewContext.Provider
      value={{
        project,
        hydrated,
        isProjectLinked: project != null,
        mappedAt,
        reviewedAt,
        review,
        status,
        error,
        elapsedSeconds,
        progress,
        generate,
        approving,
        approveError,
        approve,
      }}
    >
      {children}
    </EpisodeReviewContext.Provider>
  )
}

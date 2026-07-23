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
import type { EpisodeMap } from "@/lib/ai/episode-map"
import type { TranscriptionProgress } from "@/lib/studio/transcription-progress"
import { useSession } from "./session-context"

/**
 * Studio Wave 2, Stage 1 — raw-episode TIME MAP client state.
 *
 * The generation is a BACKGROUND JOB (whisper on a 2-hour raw recording takes
 * minutes — it cannot run inline in a request), so this is a trigger + poll:
 *   trigger() → POST .../episode-map → { jobId }
 *   then poll GET .../episode-map/status?jobId until the map appears or the job
 *   fails.
 *
 * Polling reuses the admin-standard setInterval approach (as in discovery-v2's
 * AutoRefresh) pointed at a thin status endpoint; the live "it is alive" counter
 * reuses the hybrid-button wall-clock elapsed pattern (a start timestamp, not an
 * incrementing tick, so a throttled background tab still shows true elapsed).
 *
 * NOTE: episode-map is the Studio's first background-job feature — there was no
 * prior Studio job-poller to copy, so this composes those two existing patterns
 * rather than inventing a new one.
 */

export type EpisodeMapStatus = "idle" | "running" | "ready" | "error"

interface EpisodeMapContextValue {
  map: EpisodeMap | null
  status: EpisodeMapStatus
  error: string
  /** Wall-clock seconds since the current run started (0 when not running). */
  elapsedSeconds: number
  /** Live progress heartbeat (stage / % / chunk / ETA); null until first report. */
  progress: TranscriptionProgress | null
  /** Kick off (or re-run) generation. No-op while already running. */
  generate: () => Promise<void>
}

const EpisodeMapContext = createContext<EpisodeMapContextValue | null>(null)

export function useEpisodeMap() {
  const ctx = useContext(EpisodeMapContext)
  if (!ctx) throw new Error("useEpisodeMap must be used within EpisodeMapProvider")
  return ctx
}

/** How often to poll the job status while a run is in flight. */
const POLL_INTERVAL_MS = 4000

export function EpisodeMapProvider({ children }: { children: ReactNode }) {
  const { sessionId } = useSession()

  const [map, setMap] = useState<EpisodeMap | null>(null)
  const [status, setStatus] = useState<EpisodeMapStatus>("idle")
  const [error, setError] = useState("")
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [progress, setProgress] = useState<TranscriptionProgress | null>(null)

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

  // Poll the job/map until it resolves. Shared by generate() (after the POST)
  // and the on-load re-attach, so a refreshed tab resumes the exact same loop.
  // Detecting a failed job (not just a missing map) is what stops the counter
  // from ticking forever.
  const startPolling = useCallback(
    (jobId: string) => {
      stopPolling()
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(
            `/api/admin/studio/${sessionId}/episode-map/status?jobId=${encodeURIComponent(jobId)}`,
          )
          if (!res.ok) return
          const json = await res.json()
          // Surface the live heartbeat (stage / % / chunk / ETA) for the bar.
          setProgress((json.progress as TranscriptionProgress | null) ?? null)
          if (json.map) {
            setMap(json.map as EpisodeMap)
            setStatus("ready")
            stopPolling()
            return
          }
          if (["failed", "dead", "cancelled"].includes(json.jobStatus)) {
            setStatus("error")
            setError(
              json.jobError ||
                "فشل توليد الخريطة الزمنية. تأكّد أن عامل المهام (worker) يعمل.",
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

  // Hydrate on open: an already-generated map (persisted across reloads) OR —
  // when none exists yet — an in-flight job to RE-ATTACH to. Without the latter,
  // a refresh mid-transcription lost the (React-state-only) jobId and fell back
  // to idle, hiding the progress bar and inviting a duplicate run.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/admin/studio/${sessionId}/episode-map/status`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json) return
        if (json.map) {
          setMap(json.map as EpisodeMap)
          setStatus("ready")
          return
        }
        if (
          json.jobId &&
          (json.jobStatus === "pending" || json.jobStatus === "running")
        ) {
          // Resume the elapsed counter from the job's real start time (honest),
          // falling back to now if it's missing/unparseable.
          const parsed =
            typeof json.startedAt === "string" ? Date.parse(json.startedAt) : NaN
          const startedAtMs = Number.isNaN(parsed) ? Date.now() : parsed
          startedAtRef.current = startedAtMs
          setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)))
          setProgress((json.progress as TranscriptionProgress | null) ?? null)
          setStatus("running")
          startPolling(json.jobId as string)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [sessionId, startPolling])

  // Live elapsed counter — the only honest "still working" signal during the
  // minutes-long transcription. Driven off a wall-clock start time. (The reset
  // to 0 happens in generate() at each run start, so there's no setState here.)
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
      const res = await fetch(`/api/admin/studio/${sessionId}/episode-map`, {
        method: "POST",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setStatus("error")
        setError(data.error || "تعذّر بدء توليد الخريطة الزمنية")
        stopPolling()
        return
      }
      // The POST dedups server-side: a fresh enqueue OR an already-running job
      // for this session both come back as `{ jobId }` — we just adopt it.
      startPolling(data.jobId as string)
    } catch {
      setStatus("error")
      setError("حدث خطأ في الاتصال")
      stopPolling()
    }
  }, [sessionId, status, stopPolling, startPolling])

  return (
    <EpisodeMapContext.Provider
      value={{ map, status, error, elapsedSeconds, progress, generate }}
    >
      {children}
    </EpisodeMapContext.Provider>
  )
}

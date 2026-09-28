"use client"

/**
 * Poll one background job's status (GET /api/admin/jobs/status) while it is in
 * flight, and stop the moment it is terminal.
 *
 * Seeded from `initialJob` — the page looks the in-flight job up SERVER-side by
 * its dedupe key and passes it down, so a reload or a navigation re-attaches
 * the card to the running job instead of dropping back to an idle button and
 * inviting a second paid run. `jobId` changes (a fresh enqueue) restart polling.
 *
 * `onSettled` fires exactly once per job id when it reaches a terminal status
 * (after having been observed in flight, OR when first observed terminal from a
 * fresh poll), so a parent can `router.refresh()` to pull the new data in.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
  isJobInFlight,
  type JobSnapshot,
  type JobStatusPayload,
  type WorkerSnapshot,
} from "@/lib/jobs/status-view"

export const JOB_STATUS_POLL_MS = 3000

export interface UseJobStatusOptions {
  jobId?: string | null
  /** Re-attach by dedupe key when no jobId is known yet. */
  dedupeKey?: string | null
  initialJob?: JobSnapshot | null
  pollMs?: number
  onSettled?: (job: JobSnapshot) => void
}

export interface UseJobStatusResult {
  job: JobSnapshot | null
  worker: WorkerSnapshot | null
  /** Last poll failed (network / 5xx). The card says so rather than freezing. */
  pollError: string | null
  inFlight: boolean
  refresh: () => Promise<void>
}

export function useJobStatus(opts: UseJobStatusOptions): UseJobStatusResult {
  const { jobId, dedupeKey, initialJob = null, pollMs = JOB_STATUS_POLL_MS } = opts
  const [fetched, setJob] = useState<JobSnapshot | null>(null)
  const [worker, setWorker] = useState<WorkerSnapshot | null>(null)
  const [pollError, setPollError] = useState<string | null>(null)
  const onSettledRef = useRef(opts.onSettled)
  useEffect(() => {
    onSettledRef.current = opts.onSettled
  }, [opts.onSettled])
  // A job that arrived already terminal from the server render is "settled"
  // from the start — never fire onSettled (and a refresh loop) for it.
  const settledFor = useRef<Set<string>>(
    new Set(initialJob && !isJobInFlight(initialJob) ? [initialJob.id] : []),
  )

  // The freshest snapshot we have for THIS job: a poll result, else the
  // server-rendered one. A new jobId (fresh enqueue) never shows a stale job.
  const candidate = fetched ?? initialJob
  const job = candidate && (!jobId || candidate.id === jobId) ? candidate : null

  const fetchOnce = useCallback(async () => {
    const qs = jobId
      ? `jobId=${encodeURIComponent(jobId)}`
      : dedupeKey
        ? `key=${encodeURIComponent(dedupeKey)}`
        : null
    if (!qs) return
    try {
      const res = await fetch(`/api/admin/jobs/status?${qs}`, { cache: "no-store" })
      if (!res.ok) {
        setPollError(res.status === 401 ? "انتهت الجلسة — سجّل الدخول من جديد." : `تعذّر جلب حالة المهمة (${res.status}).`)
        return
      }
      const data = (await res.json()) as JobStatusPayload
      setPollError(null)
      setWorker(data.worker)
      setJob(data.job)
      if (data.job && !isJobInFlight(data.job) && !settledFor.current.has(data.job.id)) {
        settledFor.current.add(data.job.id)
        onSettledRef.current?.(data.job)
      }
    } catch {
      setPollError("تعذّر الوصول إلى الخادم لجلب حالة المهمة — سنعيد المحاولة.")
    }
  }, [jobId, dedupeKey])

  // Poll while the job is in flight, or while a known jobId hasn't loaded yet.
  // A key lookup that finds nothing (or a finished job) is fetched once, not
  // polled forever.
  const inFlight = job ? isJobInFlight(job) : Boolean(jobId)

  useEffect(() => {
    if (!jobId && !dedupeKey) return
    // First read on the next tick (a subscription to an external system —
    // the job row — not render-derived state), then poll while in flight.
    const first = setTimeout(() => void fetchOnce(), 0)
    const id = inFlight ? setInterval(() => void fetchOnce(), pollMs) : null
    return () => {
      clearTimeout(first)
      if (id) clearInterval(id)
    }
  }, [jobId, dedupeKey, inFlight, pollMs, fetchOnce])

  return { job, worker, pollError, inFlight, refresh: fetchOnce }
}

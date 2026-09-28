/**
 * Job status — the wire shape the admin UI polls, and the ONE function that
 * turns (job, worker) into what the operator reads.
 *
 * Side-effect-free (no db, no React) so the status route, the client card and
 * the unit tests all share the exact same wording and state rules. The rule the
 * whole module exists to enforce: a job is NEVER silent. Queued with no worker,
 * queued behind another job, running at stage N, finished with a warning, dead
 * with a reason — each is its own sentence. There is no inline fallback: if the
 * worker is down the card says so; it does not quietly run the AI in the request.
 */

import { laneForJobType, type WorkerLane } from "./lanes"
import type { JobStatus } from "./types"

/** What the status endpoint returns per job (a trimmed, serializable JobRow). */
export interface JobSnapshot {
  id: string
  type: string
  status: JobStatus
  progress: Record<string, unknown> | null
  result: Record<string, unknown> | null
  error_message: string | null
  attempts: number
  max_attempts: number
  created_at: string
  started_at: string | null
  completed_at: string | null
  /** Worker id holding the lock while running. */
  locked_by: string | null
  /** Seconds since the owner last renewed the lease (DB clock); null unless running. */
  lease_age_s: number | null
}

/** What the status endpoint returns about the worker process. */
export interface WorkerSnapshot {
  /**
   * true = fresh heartbeat; false = aged out or never beat (nobody is claiming);
   * null = the probe itself failed — unknown, never reported as dead.
   */
  alive: boolean | null
  /** Seconds since the last beat; null when there is no beat. */
  lastBeatAgeS: number | null
  /** A job type in flight (any lane), for display. */
  busyWith: string | null
  /** Per-lane job type in flight. null = the worker didn't report lanes (older build). */
  lanes: Record<WorkerLane, string | null> | null
  /** Id of the worker that wrote the live beat; null when not alive / unknown. */
  workerId: string | null
}

export interface JobStatusPayload {
  job: JobSnapshot | null
  worker: WorkerSnapshot
}

export function toJobSnapshot(
  row: {
  id: string
  type: string
  status: JobStatus
  progress: Record<string, unknown> | null
  result: Record<string, unknown> | null
  error_message: string | null
  attempts: number
  max_attempts: number
  created_at: string
  started_at: string | null
  completed_at: string | null
  locked_by?: string | null
},
  leaseAgeS: number | null = null,
): JobSnapshot {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    progress: row.progress,
    result: row.result,
    error_message: row.error_message,
    attempts: row.attempts,
    max_attempts: row.max_attempts,
    created_at: row.created_at,
    started_at: row.started_at,
    completed_at: row.completed_at,
    locked_by: row.locked_by ?? null,
    lease_age_s: leaseAgeS,
  }
}

export function isJobInFlight(job: Pick<JobSnapshot, "status"> | null | undefined): boolean {
  return job?.status === "pending" || job?.status === "running"
}

export type JobViewKind =
  | "queued"
  | "queued_no_worker"
  | "waiting_behind"
  | "running"
  | "orphaned"
  | "succeeded"
  | "succeeded_warning"
  | "not_done"
  | "dead"
  | "cancelled"

export type JobViewTone = "info" | "success" | "warning" | "danger"

export interface JobView {
  kind: JobViewKind
  tone: JobViewTone
  title: string
  /** Secondary line (reason, error, warning). */
  detail: string | null
  /** «المرحلة 3/5: …» when the handler reports progress. */
  progressLabel: string | null
  /** 0..1 when the handler reports a fraction or pass/of. */
  fraction: number | null
  /** Local-dev only instruction (how to start the worker). */
  devHint: string | null
  /** Terminal and not a clean success — offer «أعد المحاولة». */
  canRetry: boolean
  terminal: boolean
}

/** Pending this long while the job's lane is busy ⇒ say it is waiting behind another job. */
export const WAITING_BEHIND_AFTER_MS = 60_000

export const WORKER_DOWN_TITLE = "في الطابور — عامل المهام لا يعمل"
export const WORKER_RESTARTED_TITLE = "العامل أُعيد تشغيله — نعيد المهمة للطابور"

/**
 * A running job whose lease has not been renewed for this long has an owner
 * that is gone. Mirrors the worker's renewal cadence (20s): 3+ missed
 * renewals. The reaper itself waits for the full window (lib/jobs/lease.ts);
 * the card may say so a little earlier — it changes wording, never state.
 */
export const ORPHAN_LEASE_AGE_S = 75

/**
 * Is this RUNNING job orphaned — held by a worker that is no longer running it?
 *   • no live worker at all;
 *   • its lease stopped being renewed;
 *   • a live worker answers under a different id and is not running this
 *     type in any lane (the owner was restarted: PM2, kill -9, a crash).
 */
export function isOrphanedRun(job: JobSnapshot, worker: WorkerSnapshot | null): boolean {
  if (job.status !== "running") return false
  if (worker?.alive === false) return true
  if (job.lease_age_s !== null && job.lease_age_s > ORPHAN_LEASE_AGE_S) return true
  if (worker?.alive && worker.workerId && job.locked_by && job.locked_by !== worker.workerId) {
    const lanes = worker.lanes ? Object.values(worker.lanes) : []
    return !lanes.includes(job.type)
  }
  return false
}
export const WORKER_DEV_HINT = "شغّل npm run worker أو npm run dev:all"

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

/** «المرحلة 3/5: البحث» / «المقطع 4/12» — from whatever shape the handler reported. */
export function describeProgress(
  progress: Record<string, unknown> | null,
): { label: string | null; fraction: number | null } {
  if (!progress) return { label: null, fraction: null }
  const pass = num(progress.pass)
  const of = num(progress.of)
  const label = str(progress.label)
  if (pass !== null && of !== null && of > 0) {
    return {
      label: `المرحلة ${pass}/${of}${label ? `: ${label}` : ""}`,
      fraction: Math.max(0, Math.min(1, (pass - 1) / of)),
    }
  }
  // Studio transcription shape: { stage, currentChunk, totalChunks, fraction }.
  const chunk = num(progress.currentChunk)
  const chunks = num(progress.totalChunks)
  const fraction = num(progress.fraction)
  if (chunk !== null && chunks !== null && chunks > 0) {
    return {
      label: `${label ?? "تحويل الصوت إلى نص"} — المقطع ${chunk}/${chunks}`,
      fraction: fraction ?? Math.max(0, Math.min(1, chunk / chunks)),
    }
  }
  return { label, fraction }
}

export function describeJob(
  job: JobSnapshot,
  worker: WorkerSnapshot | null,
  opts: { nowMs: number; isDev: boolean },
): JobView {
  const base = {
    progressLabel: null,
    fraction: null,
    devHint: null,
    canRetry: false,
    terminal: false,
    detail: null,
  } satisfies Partial<JobView>

  if (job.status === "pending") {
    // Nobody is claiming. Say so — never pretend it is "about to start".
    if (worker && worker.alive === false) {
      return {
        ...base,
        kind: "queued_no_worker",
        tone: "warning",
        title: WORKER_DOWN_TITLE,
        detail: "المهمة محفوظة وستبدأ تلقائياً فور تشغيل عامل المهام.",
        devHint: opts.isDev ? WORKER_DEV_HINT : null,
      }
    }
    const waitedMs = opts.nowMs - Date.parse(job.created_at)
    const lane = laneForJobType(job.type)
    const laneBusy = worker?.lanes
      ? worker.lanes[lane] !== null
      : worker?.busyWith != null
    if (worker?.alive && laneBusy && waitedMs > WAITING_BEHIND_AFTER_MS) {
      return {
        ...base,
        kind: "waiting_behind",
        tone: "info",
        title: "في الانتظار خلف مهمة أخرى",
        detail: "عامل المهام مشغول بمهمة سابقة، وستبدأ هذه بعدها مباشرة.",
      }
    }
    // A retry scheduled after a transient failure is pending with an error.
    return {
      ...base,
      kind: "queued",
      tone: "info",
      title: "في الطابور",
      // A retry after a transient error, or a job the reaper put back after a
      // worker restart — the message says which.
      detail: job.attempts > 0 && job.error_message ? job.error_message : null,
    }
  }

  if (job.status === "running" && isOrphanedRun(job, worker)) {
    const down = worker?.alive === false
    // It already used its one automatic re-run (lib/jobs/lease.ts): the
    // reaper will dead-letter it, not run it a third time.
    const lastRun = job.attempts > job.max_attempts
    if (lastRun) {
      return {
        ...base,
        kind: "orphaned",
        tone: "warning",
        title: down ? "عامل المهام توقّف أثناء التنفيذ" : WORKER_RESTARTED_TITLE,
        detail:
          "توقّف العامل أثناء إعادة التشغيل التلقائية لهذه المهمة — لن تُعاد مرة ثالثة تلقائياً؛ ستظهر «أعد المحاولة» خلال دقيقتين.",
        devHint: down && opts.isDev ? WORKER_DEV_HINT : null,
      }
    }
    return {
      ...base,
      kind: "orphaned",
      tone: "warning",
      title: down ? "عامل المهام توقّف أثناء التنفيذ" : WORKER_RESTARTED_TITLE,
      detail: down
        ? "ستعود المهمة للطابور تلقائياً عند تشغيل عامل المهام، وتُنفَّذ مرة أخرى."
        : "توقّف العامل السابق أثناء التنفيذ؛ ستعود المهمة للطابور خلال دقيقتين وتُنفَّذ مرة أخرى تلقائياً.",
      devHint: down && opts.isDev ? WORKER_DEV_HINT : null,
    }
  }

  if (job.status === "running") {
    const p = describeProgress(job.progress)
    return {
      ...base,
      kind: "running",
      tone: "info",
      title: "جارٍ التنفيذ",
      progressLabel: p.label,
      fraction: p.fraction,
    }
  }

  if (job.status === "succeeded") {
    const r = job.result ?? {}
    const message = str(r.messageAr)
    if (r.ok === false) {
      // The job ran to completion but the work didn't happen (room is live,
      // the model produced an invalid prep, …). A result, not a crash.
      return {
        ...base,
        kind: "not_done",
        tone: "warning",
        title: "لم تكتمل العملية",
        detail: message ?? str(r.warningAr) ?? "انتهت المهمة دون نتيجة.",
        canRetry: r.retryable !== false,
        terminal: true,
      }
    }
    const warning = str(r.warningAr)
    if (warning) {
      return {
        ...base,
        kind: "succeeded_warning",
        tone: "warning",
        title: "اكتملت مع ملاحظة",
        detail: warning,
        canRetry: true,
        terminal: true,
      }
    }
    return {
      ...base,
      kind: "succeeded",
      tone: "success",
      title: "اكتملت",
      detail: message,
      terminal: true,
    }
  }

  if (job.status === "cancelled") {
    return { ...base, kind: "cancelled", tone: "warning", title: "أُلغيت المهمة", canRetry: true, terminal: true }
  }

  // dead / failed — terminal with a reason, never a bare spinner.
  return {
    ...base,
    kind: "dead",
    tone: "danger",
    title: "فشلت المهمة",
    detail: job.error_message ?? "فشلت دون رسالة خطأ.",
    canRetry: true,
    terminal: true,
  }
}

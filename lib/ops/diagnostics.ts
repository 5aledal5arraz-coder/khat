/**
 * System diagnostics for the admin Settings hub.
 *
 * Live, server-computed health probes — not the static "connected/not connected"
 * cards the old settings page hardcoded. Each probe is cheap and fail-safe.
 *
 *   • database — real `SELECT 1` round-trip.
 *   • worker   — the worker's OWN heartbeat row (see lib/jobs/heartbeat.ts),
 *                reported as a relative age so an operator can tell whether
 *                `npm run worker` is alive, and whether it currently has work.
 *   • integrations — presence of the env keys each integration needs.
 */

import { env } from "@/lib/env"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { humanizeAge } from "@/lib/ops/format"
import {
  WORKER_HEARTBEAT_KEY,
  WORKER_HEARTBEAT_STALE_MS,
  type WorkerHeartbeatPayload,
} from "@/lib/jobs/heartbeat"

export type ProbeStatus = "ok" | "warn" | "down"

export interface Diagnostic {
  key: string
  label: string
  status: ProbeStatus
  detail: string
}

/**
 * Outcome of the worker-heartbeat probe.
 *
 * Two of these are HEALTHY, and keeping them apart is the whole point:
 *
 *   working     — fresh beat, a handler is running. Alive and busy.
 *   idle        — fresh beat, empty queue. Alive with nothing to do. This is
 *                 the NORMAL state of a low-volume queue like KHAT's and it
 *                 must never be painted as a fault. The previous probe had no
 *                 such state: it read `MAX(jobs.updated_at)` and reported
 *                 every quiet stretch over 10 minutes as a dead worker.
 *   down        — the beat aged out. It really isn't responding.
 *   never       — no heartbeat row has ever been written: a worker that has
 *                 not run since this feature shipped, or one that has never
 *                 been started on this database. NOT a death — we have no
 *                 evidence either way.
 *   unreadable  — the query failed.
 *   db_down     — no DB handle at all.
 *
 * The last three are all "we don't know". A consumer must never read them as
 * healthy, and must never report them as dead either.
 */
export type WorkerHeartbeatState =
  | "working"
  | "idle"
  | "down"
  | "never"
  | "unreadable"
  | "db_down"

export interface WorkerHeartbeat {
  state: WorkerHeartbeatState
  /** Age of the last beat in ms; null unless state is working/idle/down. */
  ageMs: number | null
  /** Worker that wrote the last beat; null when unknown. */
  workerId: string | null
  /** Job type in flight at the last beat; null unless state is `working`. */
  jobType: string | null
}

/**
 * The states that mean "the worker is alive". Both of them.
 *
 * Exported as the SINGLE definition of worker health so the Settings hub and
 * the ops home band can't drift apart on whether an idle worker is a problem.
 * It isn't.
 */
export const WORKER_HEALTHY_STATES: ReadonlySet<WorkerHeartbeatState> =
  new Set<WorkerHeartbeatState>(["working", "idle"])

/** Settings-hub detail line for the worker card. */
export function describeWorkerHeartbeat(hb: WorkerHeartbeat): string {
  switch (hb.state) {
    case "working":
      return hb.jobType
        ? `يعمل الآن — ${hb.jobType} · آخر نبض ${humanizeAge(hb.ageMs ?? 0)}`
        : `يعمل الآن · آخر نبض ${humanizeAge(hb.ageMs ?? 0)}`
    case "idle":
      // Explicitly named as healthy: the operator must not read "بلا مهام"
      // as "معطّل".
      return `شغّال بلا مهام — الطابور فاضي · آخر نبض ${humanizeAge(hb.ageMs ?? 0)}`
    case "down":
      return `ما يرد — آخر نبض ${humanizeAge(hb.ageMs ?? 0)}`
    case "never":
      return "ما وصل أي نبض بعد — شغّل npm run worker"
    case "unreadable":
      return "تعذّر القراءة"
    case "db_down":
      return "قاعدة البيانات غير متاحة"
  }
}

/**
 * Pure state classification, split out of the probe so all six outcomes are
 * unit-testable without a database (`tests/ops/worker-heartbeat.test.ts`).
 *
 * `ageMs` MUST come from the database clock — see the clocks note in
 * `lib/jobs/heartbeat.ts`. `value` is free-form JSONB and is treated as
 * untrusted: a fresh row proves the worker is alive no matter what it
 * contains, so a malformed payload degrades to `idle` (alive, nothing
 * claimed) rather than inventing a job that may not exist.
 */
export function classifyWorkerHeartbeat(row: {
  ageMs: number | null
  value: unknown
}): WorkerHeartbeat {
  if (row.ageMs === null || !Number.isFinite(row.ageMs)) {
    return { state: "unreadable", ageMs: null, workerId: null, jobType: null }
  }
  // A future-dated beat (clock skew on the DB itself) is clamped rather than
  // reported as a negative age — it can only make us look MORE alive, and
  // the staleness comparison below is what actually gates health.
  const ageMs = Math.max(0, row.ageMs)

  const p = (row.value ?? {}) as Partial<WorkerHeartbeatPayload>
  const workerId = typeof p.worker_id === "string" ? p.worker_id : null

  if (ageMs > WORKER_HEARTBEAT_STALE_MS) {
    return { state: "down", ageMs, workerId, jobType: null }
  }
  const busy = p.busy === true
  return {
    state: busy ? "working" : "idle",
    ageMs,
    workerId,
    jobType: busy && typeof p.job_type === "string" ? p.job_type : null,
  }
}

/**
 * The single worker-liveness probe. Extracted out of `getDiagnostics()` so
 * the ops home band can judge "is the system alive?" from the SAME signal the
 * Settings hub shows, instead of inventing a second definition of "alive".
 *
 * Reads the worker's own heartbeat row — it does NOT infer liveness from job
 * activity. See `lib/jobs/heartbeat.ts` for why that inference was wrong.
 *
 * The age is computed IN SQL so it is measured against the database clock,
 * the same clock the writer stamps with.
 *
 * Fail-safe: never throws — an unreadable probe is reported as `unreadable`,
 * which callers must treat as unknown, not as OK.
 */
export async function probeWorkerHeartbeat(): Promise<WorkerHeartbeat> {
  if (!db) return { state: "db_down", ageMs: null, workerId: null, jobType: null }
  try {
    const res = (await db.execute(sql`
      SELECT value,
             EXTRACT(EPOCH FROM (NOW() - updated_at)) * 1000 AS age_ms
        FROM config_store
       WHERE key = ${WORKER_HEARTBEAT_KEY}
    `)) as unknown as {
      rows: Array<{ value: unknown; age_ms: string | number | null }>
    }
    const row = res.rows[0]
    if (!row) return { state: "never", ageMs: null, workerId: null, jobType: null }
    return classifyWorkerHeartbeat({
      ageMs: row.age_ms === null ? null : Number(row.age_ms),
      value: row.value,
    })
  } catch {
    return { state: "unreadable", ageMs: null, workerId: null, jobType: null }
  }
}

export async function getDiagnostics(): Promise<Diagnostic[]> {
  const out: Diagnostic[] = []

  // ── Database: real probe ──────────────────────────────────────────────────
  let dbOk = false
  if (db) {
    try {
      await db.execute(sql`SELECT 1`)
      dbOk = true
    } catch {
      dbOk = false
    }
  }
  out.push({
    key: "database",
    label: "قاعدة البيانات",
    status: dbOk ? "ok" : "down",
    detail: dbOk ? "متصلة وتعمل" : "تعذّر الاتصال بقاعدة البيانات",
  })

  // ── Worker heartbeat (the worker's own beat) ──────────────────────────────
  // Same probe the ops home health band reads — see probeWorkerHeartbeat().
  // `idle` is a HEALTHY state: an empty queue is not a fault, so it stays
  // green here exactly as it stays green on the home band.
  const heartbeat = await probeWorkerHeartbeat()
  out.push({
    key: "worker",
    label: "عامل المهام",
    status: WORKER_HEALTHY_STATES.has(heartbeat.state)
      ? "ok"
      : heartbeat.state === "down" || heartbeat.state === "db_down"
        ? "down"
        : "warn",
    detail: describeWorkerHeartbeat(heartbeat),
  })

  // ── Integration keys (presence only — never expose the values) ────────────
  const keyProbe = (
    key: string,
    label: string,
    present: boolean,
    onMissing: string,
  ): Diagnostic => ({
    key,
    label,
    status: present ? "ok" : "warn",
    detail: present ? "المفتاح مضبوط" : onMissing,
  })

  out.push(
    keyProbe("youtube", "YouTube API", !!env.YOUTUBE_API_KEY, "أضف YOUTUBE_API_KEY لجلب الحلقات"),
    keyProbe(
      "openai",
      "OpenAI",
      !!env.OPENAI_API_KEY,
      "أضف OPENAI_API_KEY لتشغيل الذكاء الاصطناعي",
    ),
    keyProbe(
      "gemini",
      "Gemini",
      !!(env.GEMINI_API_KEY || env.GOOGLE_API_KEY),
      "اختياري — أضف GEMINI_API_KEY لتفعيل مزوّد Gemini",
    ),
    keyProbe(
      "email",
      "البريد (Resend)",
      !!env.RESEND_API_KEY,
      "أضف RESEND_API_KEY لإرسال الإشعارات والنشرة",
    ),
  )

  return out
}

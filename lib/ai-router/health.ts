/**
 * AI provider health probe — production-readiness fix sprint #1.
 *
 * Reads the recent `ai_runs` rows to decide whether the AI router is
 * currently usable. The probe is intentionally cheap (one query, no
 * outbound LLM call) so server components can call it on every render.
 *
 * Three states the rest of the system branches on:
 *
 *   ok            — recent successful runs, no quota errors. Generate
 *                   buttons enabled, no banner.
 *   degraded      — recent rate-limited or transient failures but no
 *                   sustained quota error. Generate buttons enabled but
 *                   warned ("AI may be slow today").
 *   quota_exceeded — sustained 429 quota errors with no successful run
 *                   in the recent window. Generate buttons disabled,
 *                   banner shown.
 *
 * "Recent window" is the last 30 minutes by default — short enough that
 * a fixed billing issue clears immediately, long enough to ride out one
 * transient blip.
 */

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

export type AiHealthState = "ok" | "degraded" | "quota_exceeded"

export interface AiHealthSnapshot {
  state: AiHealthState
  /** Timestamp of the most recent successful run within the window, ISO. */
  last_ok_at: string | null
  /** Most recent error_class within the window. */
  last_error_class: string | null
  /** Sample message from the most recent failure (truncated). */
  last_error_message: string | null
  /** Counts within the recent window for each terminal status. */
  recent_counts: {
    ok: number
    failed: number
    quota: number
    rate_limited: number
  }
  /** Operator-friendly Arabic copy for the banner. */
  banner_message: string | null
  /** Whether generate buttons should be disabled. */
  buttons_disabled: boolean
}

const WINDOW_MINUTES = 30

export async function getAiHealth(): Promise<AiHealthSnapshot> {
  const empty: AiHealthSnapshot = {
    state: "ok",
    last_ok_at: null,
    last_error_class: null,
    last_error_message: null,
    recent_counts: { ok: 0, failed: 0, quota: 0, rate_limited: 0 },
    banner_message: null,
    buttons_disabled: false,
  }
  if (!db) return empty

  const rows = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'succeeded')::int AS ok,
      COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
      COUNT(*) FILTER (WHERE error_class = 'quota_exceeded')::int AS quota,
      COUNT(*) FILTER (WHERE error_class = 'rate_limited')::int AS rate_limited,
      MAX(completed_at) FILTER (WHERE status = 'succeeded') AS last_ok
    FROM ai_runs
    WHERE started_at >= NOW() - (${WINDOW_MINUTES}::int * INTERVAL '1 minute')
  `)
  const r = rows.rows[0] as
    | {
        ok: number
        failed: number
        quota: number
        rate_limited: number
        last_ok: Date | null
      }
    | undefined
  if (!r) return empty

  const lastOkAt =
    r.last_ok instanceof Date ? r.last_ok.toISOString() : null

  // Most recent failure within the window — used for the banner copy.
  const recentErr = await db.execute(sql`
    SELECT error_class, error_message
    FROM ai_runs
    WHERE started_at >= NOW() - (${WINDOW_MINUTES}::int * INTERVAL '1 minute')
      AND status = 'failed'
    ORDER BY started_at DESC
    LIMIT 1
  `)
  const errRow = recentErr.rows[0] as
    | { error_class: string | null; error_message: string | null }
    | undefined

  const counts = {
    ok: r.ok ?? 0,
    failed: r.failed ?? 0,
    quota: r.quota ?? 0,
    rate_limited: r.rate_limited ?? 0,
  }

  // Decision tree:
  //   ≥1 quota error AND no successful run in the window → quota_exceeded
  //   ≥1 rate_limited error AND no quota → degraded
  //   any failures but a recent ok      → degraded
  //   otherwise                         → ok
  let state: AiHealthState = "ok"
  let banner: string | null = null
  let disabled = false
  if (counts.quota > 0 && counts.ok === 0) {
    state = "quota_exceeded"
    disabled = true
    banner =
      "تم تجاوز حصة OpenAI الحالية. التوليد متوقف حتى يُعاد شحن الحساب. " +
      "تحقق من فوترة المزود ثم أعد المحاولة."
  } else if (counts.quota > 0) {
    // Quota errors with at least one ok — we're throttled but functional.
    state = "degraded"
    banner = "تم رصد أخطاء حصة من OpenAI خلال آخر نصف ساعة. التوليد قد يفشل أحياناً."
  } else if (counts.rate_limited > 0) {
    state = "degraded"
    banner = "OpenAI يحدّ من المعدل حالياً. التوليد قد يكون أبطأ من المعتاد."
  } else if (counts.failed > 0 && counts.ok === 0) {
    state = "degraded"
    banner = "آخر محاولات الذكاء الاصطناعي فشلت. تحقق من الإعدادات قبل المتابعة."
  }

  return {
    state,
    last_ok_at: lastOkAt,
    last_error_class: errRow?.error_class ?? null,
    last_error_message: errRow?.error_message ?? null,
    recent_counts: counts,
    banner_message: banner,
    buttons_disabled: disabled,
  }
}

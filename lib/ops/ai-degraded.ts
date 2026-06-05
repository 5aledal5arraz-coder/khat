/**
 * A10 — AI degraded-state detector for the admin banner.
 *
 * Single read-only query: count `ai-router.rejected` + `rate-limit.rejected`
 * events in a rolling window. Above threshold → banner shows. Below
 * threshold → banner disappears on next navigation (no manual reset).
 *
 * Why these two event types:
 *   • `ai-router.rejected` — AI router caught a RateLimitError before
 *     the ai_runs row could be created. This is the cleanest "OpenAI
 *     is rate-limiting us / quota exhausted" signal.
 *   • `rate-limit.rejected` — Our own policy blocked the call. Same
 *     operator-facing symptom ("click Generate, nothing happens").
 *
 * Why NOT include `jobs.failed` / `jobs.dead`:
 *   • Those types include non-AI handlers (market.scheduler,
 *     ai-runs-sweeper, etc). Including them would mix signals from
 *     unrelated subsystems and produce false-positive "AI degraded"
 *     banners. The operator-visible signal we care about is "the AI
 *     pipeline is rejecting calls" — exactly what the two router-level
 *     events emit.
 *
 * Performance:
 *   • Single SQL with COUNT + filter on (source, event_at). Hits the
 *     existing idx_system_events_source_type_event_at index.
 *   • Hard 2-second timeout via Promise.race so a wedged pool can't
 *     hold the admin layout response. On timeout → degraded=false
 *     (fail-safe; banner stays hidden).
 *   • No client polling — caller invokes once per admin page render,
 *     which is bounded by operator navigation cadence.
 *
 * Defaults (tuned for v1):
 *   • windowMinutes = 5
 *   • threshold     = 3
 *   • Tweakable via call-site args; not env-driven (single call site).
 */

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

export interface AiDegradedState {
  /** True when recent_count >= threshold within the window. */
  degraded: boolean
  /** Number of AI rejection events counted in the window. */
  recent_count: number
  /** Threshold the count was compared against. */
  threshold: number
  /** Window start time (now - windowMinutes). */
  window_since: Date
  /** Window size in minutes. */
  window_minutes: number
}

const DEFAULT_WINDOW_MINUTES = 5
const DEFAULT_THRESHOLD = 3
const PROBE_TIMEOUT_MS = 2_000

/**
 * Count AI-rejection events in the rolling window and return the
 * derived degraded boolean. Fail-safe: returns `degraded: false` on
 * any error (DB down, timeout, etc.). The admin layout must keep
 * rendering even if this probe fails.
 */
export async function getAiDegradedState(
  opts: { windowMinutes?: number; threshold?: number } = {},
): Promise<AiDegradedState> {
  const windowMinutes = Math.max(1, opts.windowMinutes ?? DEFAULT_WINDOW_MINUTES)
  const threshold = Math.max(1, opts.threshold ?? DEFAULT_THRESHOLD)
  const windowSince = new Date(Date.now() - windowMinutes * 60_000)

  // Build the "fail-safe" return value once so every error path uses it.
  const safeFallback: AiDegradedState = {
    degraded: false,
    recent_count: 0,
    threshold,
    window_since: windowSince,
    window_minutes: windowMinutes,
  }

  if (!db) return safeFallback

  try {
    const result = (await Promise.race([
      db.execute(sql`
        SELECT count(*)::int AS n
          FROM system_events
         WHERE source IN ('ai-router', 'rate-limit')
           AND event_type = 'rejected'
           AND event_at >= ${windowSince.toISOString()}
      `),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("ai-degraded probe timeout")), PROBE_TIMEOUT_MS),
      ),
    ])) as unknown as { rows: Array<{ n: number }> }

    const recentCount = Number(result.rows[0]?.n ?? 0)
    return {
      degraded: recentCount >= threshold,
      recent_count: recentCount,
      threshold,
      window_since: windowSince,
      window_minutes: windowMinutes,
    }
  } catch {
    // Defensive — never let this probe break the admin layout.
    return safeFallback
  }
}

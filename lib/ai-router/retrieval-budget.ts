/**
 * Khat Brain — daily cost cap for grounded RETRIEVAL calls.
 *
 * `recordAiRun()` (record-run.ts) deliberately carries NO rate-limit permit
 * — it's the lean telemetry primitive for non-routed provider calls, and a
 * permit there would throttle high-volume embedding batches. But grounded
 * web retrieval (Gemini + Google Search) has a REAL per-search dollar fee on
 * top of tokens, so an unbounded loop (a season-wide re-analysis, a runaway
 * job retry) could quietly burn money outside the router's rate limiter.
 *
 * This is the light permit for exactly that path: before a retrieval call we
 * sum today's recorded `research_retrieval` spend from `ai_runs` and refuse
 * once it crosses a daily USD cap. It is intentionally a soft, Postgres-backed
 * guard (not an in-memory counter) so the web process and the worker share one
 * honest running total. Callers treat exhaustion as fail-safe: the analysis
 * still runs, just without fresh sources.
 *
 * Cap is a load-time tuning knob (read at point of use, per lib/env.ts's scope
 * note): GEMINI_RETRIEVAL_DAILY_USD_CAP, default $5.00/day. Set to 0 to disable
 * retrieval entirely; set high to effectively lift the cap.
 */

import { and, gte, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { aiRuns } from "@/lib/db/schema/ai-runs"

const DEFAULT_DAILY_CAP_USD = 5.0

/** Thrown when the retrieval daily budget is exhausted. */
export class RetrievalBudgetExceededError extends Error {
  readonly spentUsd: number
  readonly capUsd: number
  constructor(spentUsd: number, capUsd: number) {
    super(
      `سقف كلفة البحث الموثّق اليومي انتهى (${spentUsd.toFixed(
        2,
      )}$ / ${capUsd.toFixed(2)}$). البحث متوقّف حتى بداية اليوم التالي.`,
    )
    this.name = "RetrievalBudgetExceededError"
    this.spentUsd = spentUsd
    this.capUsd = capUsd
  }
}

/** Parse the daily cap from env, clamped to a non-negative number. */
export function retrievalDailyCapUsd(): number {
  const raw = process.env.GEMINI_RETRIEVAL_DAILY_USD_CAP
  if (raw == null || raw === "") return DEFAULT_DAILY_CAP_USD
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DAILY_CAP_USD
}

/** UTC midnight for "today" — the window the cap resets on. */
function startOfUtcDay(now = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
}

/**
 * Sum today's recorded retrieval spend (USD) across `research_retrieval`
 * runs. Counts `running` rows too so concurrent in-flight calls can't all
 * slip under the cap by racing before any completes; a NULL cost (unknown)
 * contributes 0, which is the honest floor.
 */
export async function getRetrievalSpendTodayUsd(): Promise<number> {
  if (!db) return 0
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${aiRuns.cost_usd}), 0)::float8`,
    })
    .from(aiRuns)
    .where(
      and(
        sql`${aiRuns.task_kind} = 'research_retrieval'`,
        gte(aiRuns.started_at, startOfUtcDay()),
      ),
    )
  return row?.total ?? 0
}

export interface RetrievalBudgetStatus {
  allowed: boolean
  spentUsd: number
  capUsd: number
}

/** Report the current budget status without throwing. */
export async function checkRetrievalBudget(): Promise<RetrievalBudgetStatus> {
  const capUsd = retrievalDailyCapUsd()
  const spentUsd = await getRetrievalSpendTodayUsd()
  return { allowed: spentUsd < capUsd, spentUsd, capUsd }
}

/**
 * Permit gate: throw `RetrievalBudgetExceededError` when today's retrieval
 * spend has reached the cap. Call this immediately BEFORE opening a
 * `recordAiRun("research_retrieval", …)`.
 */
export async function assertRetrievalBudget(): Promise<void> {
  const { allowed, spentUsd, capUsd } = await checkRetrievalBudget()
  if (!allowed) throw new RetrievalBudgetExceededError(spentUsd, capUsd)
}

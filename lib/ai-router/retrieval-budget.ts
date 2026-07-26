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
 * note): GEMINI_RETRIEVAL_DAILY_USD_CAP. Set to 0 to disable retrieval
 * entirely; set high to effectively lift the cap.
 *
 * ── Sizing: where $25 comes from, and what it is NOT based on ──────────────
 *
 * The cap is a runaway-loop brake, NOT a usage budget. Tripping it degrades
 * quality silently (callers fall back to source-less analysis), so it must
 * sit far above normal operation — a cap that trips on a busy-but-legitimate
 * day is worse than no cap, because it converts "expensive" into "quietly
 * wrong".
 *
 * WE HAVE NO PRODUCTION USAGE HISTORY TO SIZE AGAINST. Say it plainly: this
 * number was not derived from observed spend. `research_retrieval` telemetry
 * only started being written recently and the table holds a handful of local
 * rows. Anyone can check what history actually exists before trusting any
 * usage-based claim about this cap — including a future version of this
 * comment:
 *
 *     SELECT date_trunc('day', started_at) AS day,
 *            count(*) AS calls, sum(cost_usd) AS usd
 *       FROM ai_runs
 *      WHERE task_kind = 'research_retrieval'
 *      GROUP BY 1 ORDER BY 1;
 *
 * An earlier revision of this comment justified the cap with a specific
 * measured day ("31 calls / 87 queries / $1.83 on 2026-07-24"). That day has
 * no rows behind it — the figure could not be reproduced from `ai_runs`, so
 * it has been removed rather than restated. A number that justifies a cap has
 * to be one someone else can look up.
 *
 * What the $25 IS derived from — both checkable in this repo today:
 *
 *   1. Ceiling arithmetic, from the published rate the code already uses.
 *      `GEMINI_3_GROUNDING_USD_PER_QUERY = 0.014` (grounded-evidence.ts), so
 *      $25/day ≈ 1,785 billed searches/day before the brake engages. A single
 *      gather runs a handful of queries and may bill one re-roll
 *      (`EMPTY_GROUNDING_RETRIES = 1`), i.e. tens of cents at the very most —
 *      so reaching the cap takes hundreds of gathers in one UTC day, which is
 *      a loop, not a work day. Token cost rides on top and only lowers that
 *      count; the brake is deliberately sized off the fee that scales with
 *      searches, because that is the one a runaway multiplies.
 *   2. Deliberate alignment: $25/day is the same figure as the router's
 *      `expensive` tier daily limit (`lib/ai-router/rate-limit.ts`,
 *      DEFAULT_LIMITS.expensive.maxDailyCostUsd). Retrieval must not be the
 *      one path allowed to outspend the most expensive routed tier, and
 *      keeping the two equal means an operator reasons about one ceiling.
 *
 * Limits of the above: (1) is an ORDER-OF-MAGNITUDE bound, not a forecast —
 * it says the cap cannot plausibly be hit by normal use, which is the only
 * property a brake needs. It does NOT establish that $25 is optimal, and it
 * should be replaced by the query above once real days exist to read.
 */

import { and, gte, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { aiRuns } from "@/lib/db/schema/ai-runs"

const DEFAULT_DAILY_CAP_USD = 25.0

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

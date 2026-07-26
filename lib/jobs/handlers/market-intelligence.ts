/**
 * Phase X Step 1 — Market Intelligence job handlers.
 *
 *   market.collect         — fetch fresh signals from configured adapters
 *   market.extract         — fill theme/emotional_trigger via AI router
 *   market.cluster_signals — recompute market_topic_clusters projection
 *
 * Idempotent. Safe to run on a cron schedule (collect daily, cluster
 * nightly). The extraction handler claims signals where theme IS NULL,
 * so multiple workers don't double-process.
 */

import { registerHandler } from "../registry"
import { enqueueJob, enqueueRecurringTick } from "../queue"
import { runPresetCollection } from "@/lib/market-intelligence/ingestion"
import { extractPendingSignals } from "@/lib/market-intelligence/extraction"
import { recomputeClusters } from "@/lib/market-intelligence/clustering"
import { getPresets, type MarketPreset } from "@/lib/market-intelligence/presets"
import type { MarketSource } from "@/lib/market-intelligence/adapters"

// ── Schedule cadence (operator-invisible — Khat Brain owns this) ──────
//
// The worker self-schedules these jobs at startup via
// `ensureMarketScheduler()` (see lib/jobs/scheduler-bootstrap.ts). Each
// handler also re-enqueues its NEXT occurrence on success — so the
// cadence keeps rolling as long as the worker is alive, with zero
// operator action.

const DAILY_MS = 24 * 60 * 60 * 1000
const WEEKLY_MS = 7 * DAILY_MS
const CHAIN_DELAY_MS = 60 * 1000 // 1 min — give the DB writes a beat to settle

// ── market.collect ────────────────────────────────────────────────────
//
// SLICED. One `market.collect` job processes as many presets as fit inside
// COLLECT_SLICE_MS, then hands the REST to a fresh job via `startIndex`.
// The wall time of a single job is therefore bounded by the slice budget —
// it does NOT grow with the preset count or the number of enabled sources.
//
// Why (2026-07-26): the handler used to run every preset in one job, so its
// wall time was O(presets × sources) against a fixed 300s budget. Measured on
// the real adapters, 30 presets cost:
//     youtube + podcast_apple (default)   ~41s   → comfortably inside 300s
//     + web_grounded (opt-in, per preset) ~681s  → 722s total, 2.4× the budget
// Turning on MARKET_WEB_GROUNDED_ENABLED therefore dead-lettered EVERY run
// (observed: 616s / 653s "late-arrived handler completion … result discarded"),
// even though the work itself completed. Slicing fixes the class of bug, not
// the one instance: adding presets or a 4th source can no longer blow the
// budget, and a failure now costs one slice instead of the whole run.
//
// The slice budget must stay strictly under the handler budget in worker.ts
// (`HANDLER_TIMEOUT_MS["market.collect"]` = 5 * 60_000). The deadline is
// checked BETWEEN presets, so the true worst case is
// COLLECT_SLICE_MS + (slowest single preset). Slowest measured preset is the
// grounded one at ~24s → 180s + 24s = 204s, a 1.47× margin under 300s.
// `tests/jobs/market-collect-slicing.test.ts` pins that relationship.
export const COLLECT_SLICE_MS = 180_000

/** Worst observed wall time for ONE preset across all sources (grounded web,
 *  measured 2026-07-26: 21.2s / 22.6s / 24.4s). Used only by the test that
 *  pins the slice-vs-budget margin. */
export const COLLECT_SLOWEST_PRESET_MS = 25_000

interface CollectPayload extends Record<string, unknown> {
  /** When set, only this preset is run. Otherwise all presets. */
  preset?: MarketPreset
  /** Per-source max results (default 10). */
  maxPerSource?: number
  /** When true, this run is part of the automatic schedule — handlers
   *  re-enqueue the next pipeline stage AND the next daily collect on
   *  success. Manual "refresh now" calls (operator button) also set
   *  this so the pipeline still completes end-to-end. */
  scheduled?: boolean
  /** Continuation cursor — index of the first preset THIS slice handles.
   *  Absent/0 on the first slice; set by the handler when it hands the
   *  remainder to the next job. */
  startIndex?: number
  /** New signals inserted by the earlier slices of this chain, so the
   *  extract hand-off can fire once, on the last slice, on the CHAIN's
   *  total rather than the final slice's own count. */
  insertedSoFar?: number
}
interface CollectResult extends Record<string, unknown> {
  /** Presets processed by THIS slice. */
  presets_run: number
  /** New signals inserted by THIS slice. */
  inserted: number
  not_configured: string[]
  notes: Array<{ preset: string; source: MarketSource; note: string }>
  /** Slice bookkeeping — the operator can see a chain's shape at a glance. */
  slice_start: number
  slice_end: number
  presets_total: number
  /** false → this slice enqueued a continuation; the chain is still running. */
  completed: boolean
  /** Cumulative inserts across the whole chain up to and including this slice. */
  inserted_total: number
}

registerHandler<CollectPayload, CollectResult>(
  "market.collect",
  async (payload) => {
    const presets = payload.preset ? [payload.preset] : await getPresets()
    // Clamp: a cursor from an older payload shape (or a hand-edited row) must
    // never index outside the list — an out-of-range start would silently
    // "succeed" having collected nothing.
    const startIndex = Math.min(
      Math.max(0, Math.trunc(payload.startIndex ?? 0)),
      presets.length,
    )
    const sliceDeadline = Date.now() + COLLECT_SLICE_MS

    let inserted = 0
    const not_configured: string[] = []
    const notes: Array<{ preset: string; source: MarketSource; note: string }> = []

    // `cursor` is always the index of the next UNPROCESSED preset.
    let cursor = startIndex
    while (cursor < presets.length) {
      const preset = presets[cursor]
      const r = await runPresetCollection(preset, {
        maxPerSource: payload.maxPerSource,
      })
      cursor++
      inserted += r.inserted
      for (const c of r.collected) {
        if (!c.result.configured) {
          not_configured.push(`${preset.label}/${c.source}`)
        }
        if (c.result.note) {
          notes.push({ preset: preset.label, source: c.source, note: c.result.note })
        }
      }
      // Slice is full and work remains → stop here and hand over. Checked
      // AFTER a whole preset so a preset is never split mid-way.
      if (cursor < presets.length && Date.now() >= sliceDeadline) break
    }

    const completed = cursor >= presets.length
    const insertedTotal = (payload.insertedSoFar ?? 0) + inserted

    if (!completed) {
      // Hand the remainder to a fresh job. No delay — the slices touch
      // disjoint presets, so there is nothing to let "settle" between them.
      // Priority 4 > the scheduler's 3, so an in-flight chain always drains
      // before a newly scheduled collect starts.
      //
      // `preset` is carried through deliberately: the continuation must
      // rebuild the SAME list this slice indexed into. Dropping it would make
      // the next slice index `startIndex` into the full 30-preset list.
      await enqueueJob(
        "market.collect",
        {
          ...(payload.preset ? { preset: payload.preset } : {}),
          maxPerSource: payload.maxPerSource,
          scheduled: payload.scheduled === true,
          startIndex: cursor,
          insertedSoFar: insertedTotal,
        },
        {
          priority: 4,
          // Retry a slice: the collection is idempotent by construction
          // (persistSignal upserts ON CONFLICT and counts only genuine
          // inserts via xmax=0), and a slice that dies without retrying now
          // abandons every remaining preset in the chain.
          maxAttempts: 2,
        },
      )
    } else if (insertedTotal > 0) {
      // Auto-chain → extract (so a single trigger drives the full
      // pipeline). Always runs, even for one-off manual refreshes. Fires on
      // the LAST slice only, against the chain's cumulative insert count.
      await enqueueJob(
        "market.extract",
        { scheduled: payload.scheduled === true },
        {
          priority: 4,
          maxAttempts: 2,
          runAfter: new Date(Date.now() + CHAIN_DELAY_MS),
        },
      )
    }

    return {
      presets_run: cursor - startIndex,
      inserted,
      not_configured,
      notes,
      slice_start: startIndex,
      slice_end: cursor,
      presets_total: presets.length,
      completed,
      inserted_total: insertedTotal,
    }
  },
)

// ── market.extract ────────────────────────────────────────────────────

interface ExtractPayload extends Record<string, unknown> {
  batchSize?: number
  limit?: number
  scheduled?: boolean
}
interface ExtractResult extends Record<string, unknown> {
  scanned: number
  processed: number
  ai_run_ids: string[]
}

registerHandler<ExtractPayload, ExtractResult>(
  "market.extract",
  async (payload) => {
    const r = await extractPendingSignals({
      batchSize: payload.batchSize,
      limit: payload.limit,
    })
    // Auto-chain → cluster_signals + score_signals. Both are downstream
    // of extraction and independent of each other, so they run in
    // parallel. Clustering ignores signal_score; scoring needs the
    // theme that extraction just wrote.
    await enqueueJob(
      "market.cluster_signals",
      { scheduled: payload.scheduled === true },
      {
        priority: 4,
        maxAttempts: 1,
        runAfter: new Date(Date.now() + CHAIN_DELAY_MS),
      },
    )
    await enqueueJob(
      "market.score_signals",
      { scheduled: payload.scheduled === true },
      {
        priority: 4,
        maxAttempts: 1,
        runAfter: new Date(Date.now() + CHAIN_DELAY_MS),
      },
    )
    // Backlog drain: each run scans at most `limit` (default 50 in
    // extractPendingSignals). If this run filled that window AND made
    // progress, more pending signals likely remain — re-enqueue another
    // extract so a large backlog clears across successive short runs
    // instead of trickling out one window per nightly tick. Guarded on
    // processed > 0 (don't loop on rows the AI keeps leaving unresolved)
    // and spaced by CHAIN_DELAY_MS (no tight loop).
    const effectiveLimit = payload.limit ?? 50 // mirrors extraction default
    if (r.scanned >= effectiveLimit && r.processed > 0) {
      await enqueueJob(
        "market.extract",
        {
          scheduled: payload.scheduled === true,
          batchSize: payload.batchSize,
          limit: payload.limit,
        },
        {
          priority: 4,
          maxAttempts: 1,
          runAfter: new Date(Date.now() + CHAIN_DELAY_MS),
        },
      )
    }
    return r
  },
)

// ── market.cluster_signals ────────────────────────────────────────────

interface ClusterPayload extends Record<string, unknown> {
  lookbackDays?: number
  scheduled?: boolean
}
interface ClusterResult extends Record<string, unknown> {
  scanned: number
  written: number
  buckets_skipped: number
}

registerHandler<ClusterPayload, ClusterResult>(
  "market.cluster_signals",
  async (payload) => {
    return await recomputeClusters({ lookbackDays: payload.lookbackDays })
  },
)

// ── market.scheduler ──────────────────────────────────────────────────
//
// The recurring tick. Fires daily, decides whether to enqueue a
// `market.collect` (which then auto-chains extract → cluster). Always
// re-enqueues itself for the next 24h tick. This is the entire
// scheduling surface — no external cron, no external script. The
// operator only sees status; the brain owns cadence.

interface SchedulerPayload extends Record<string, unknown> {
  /** Set on the first ever scheduler tick so we collect immediately
   *  instead of waiting until the next day. */
  initial?: boolean
}
interface SchedulerResult extends Record<string, unknown> {
  enqueued_collect: boolean
  enqueued_cluster: boolean
  enqueued_decay: boolean
  next_tick_at: string
}

registerHandler<SchedulerPayload, SchedulerResult>(
  "market.scheduler",
  async (payload) => {
    const { sql } = await import("drizzle-orm")
    const { db } = await import("@/lib/db")
    let enqueuedCollect = false
    let enqueuedCluster = false
    let enqueuedDecay = false

    if (db) {
      // Daily collect cadence — enqueue if (a) initial tick or (b) no
      // successful collect in the last 24h AND no pending/running one.
      const recentCollect = await db.execute(sql`
        SELECT
          (SELECT max(completed_at) FROM jobs WHERE type='market.collect' AND status='succeeded') AS last_ok,
          (SELECT count(*)::int FROM jobs WHERE type='market.collect' AND status IN ('pending','running')) AS inflight
      `)
      const lastOk = (recentCollect.rows[0] as { last_ok?: string | null }).last_ok ?? null
      const inflight = Number((recentCollect.rows[0] as { inflight?: number }).inflight ?? 0)
      const collectStale =
        !lastOk || Date.now() - new Date(lastOk).getTime() >= DAILY_MS
      if ((payload.initial || collectStale) && inflight === 0) {
        await enqueueJob(
          "market.collect",
          { scheduled: true },
          // maxAttempts 2 matches the continuation slices: collection is
          // idempotent (upsert), and since collect is now sliced, losing the
          // FIRST slice to a transient blip would abandon the whole chain.
          // The `inflight === 0` guard above still prevents a duplicate chain —
          // a pending continuation slice counts as in-flight.
          { priority: 3, maxAttempts: 2 },
        )
        enqueuedCollect = true
      }

      // Weekly cluster cadence — only fires if collect/extract haven't
      // already triggered one in the last week. (When the daily collect
      // produces signals, the chain auto-enqueues cluster; this is the
      // safety net for weeks when nothing new came in.)
      const recentCluster = await db.execute(sql`
        SELECT
          (SELECT max(completed_at) FROM jobs WHERE type='market.cluster_signals' AND status='succeeded') AS last_ok,
          (SELECT count(*)::int FROM jobs WHERE type='market.cluster_signals' AND status IN ('pending','running')) AS inflight
      `)
      const lastClusterOk =
        (recentCluster.rows[0] as { last_ok?: string | null }).last_ok ?? null
      const clusterInflight = Number(
        (recentCluster.rows[0] as { inflight?: number }).inflight ?? 0,
      )
      const clusterStale =
        !lastClusterOk || Date.now() - new Date(lastClusterOk).getTime() >= WEEKLY_MS
      if (clusterStale && clusterInflight === 0) {
        await enqueueJob(
          "market.cluster_signals",
          { scheduled: true },
          { priority: 3, maxAttempts: 1 },
        )
        enqueuedCluster = true
      }

      // Daily taste-decay tick — nightly soft fade on the learning
      // weights so old preferences slowly fade unless reinforced.
      const recentDecay = await db.execute(sql`
        SELECT
          (SELECT max(completed_at) FROM jobs WHERE type='market.taste_decay' AND status='succeeded') AS last_ok,
          (SELECT count(*)::int FROM jobs WHERE type='market.taste_decay' AND status IN ('pending','running')) AS inflight
      `)
      const lastDecayOk =
        (recentDecay.rows[0] as { last_ok?: string | null }).last_ok ?? null
      const decayInflight = Number(
        (recentDecay.rows[0] as { inflight?: number }).inflight ?? 0,
      )
      const decayStale =
        !lastDecayOk || Date.now() - new Date(lastDecayOk).getTime() >= DAILY_MS
      if (decayStale && decayInflight === 0) {
        await enqueueJob(
          "market.taste_decay",
          { scheduled: true },
          { priority: 2, maxAttempts: 1 },
        )
        enqueuedDecay = true
      }
    }

    // Re-enqueue the next tick. 24h delay. Idempotent — a reclaim/restart
    // re-run (or the startup bootstrap) won't add a second schedule chain.
    const nextTickAt = new Date(Date.now() + DAILY_MS)
    await enqueueRecurringTick(
      "market.scheduler",
      {},
      { priority: 2, maxAttempts: 1, runAfter: nextTickAt },
    )

    return {
      enqueued_collect: enqueuedCollect,
      enqueued_cluster: enqueuedCluster,
      enqueued_decay: enqueuedDecay,
      next_tick_at: nextTickAt.toISOString(),
    }
  },
)

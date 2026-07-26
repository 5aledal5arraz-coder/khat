/**
 * market.collect slicing — 2026-07-26.
 *
 * Regression cover for the production incident where EVERY `market.collect`
 * run dead-lettered at "Handler timed out after 300004ms", while the worker
 * log showed the handler actually FINISHING at 616–653s ("late-arrived
 * handler completion … result discarded").
 *
 * Root cause: the handler ran every preset in ONE job, so its wall time was
 * O(presets × sources) against a fixed 300s budget. Measured on the real
 * adapters (30 presets): youtube + podcast_apple ≈ 41s, but the opt-in
 * `web_grounded` source adds ≈ 22.7s PER PRESET ≈ 681s — 722s total.
 *
 * What this file locks down:
 *   1. The slice budget stays strictly under the worker's handler budget,
 *      with room for one whole preset (the deadline is checked BETWEEN
 *      presets, never mid-preset).
 *   2. That relationship survives an edit to worker.ts — the budget lives
 *      there, so the test reads it from the source rather than trusting a
 *      copy of the number.
 *   3. The cursor arithmetic: slices partition the preset list exactly once,
 *      with no gap and no repeat, and terminate.
 *
 * The handler body itself is not invoked here — it needs a live DB and live
 * network. The cursor walk below mirrors its loop exactly; the real path is
 * covered by running the worker locally.
 */

import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  COLLECT_SLICE_MS,
  COLLECT_SLOWEST_PRESET_MS,
} from "@/lib/jobs/handlers/market-intelligence"

/** Read `"market.collect": <expr>` out of worker.ts and evaluate the literal
 *  arithmetic, so this test fails if someone edits the budget there. */
function workerBudgetMs(jobType: string): number {
  const src = readFileSync(
    path.resolve(__dirname, "../../lib/jobs/worker.ts"),
    "utf8",
  )
  const m = new RegExp(`"${jobType}":\\s*([0-9_*\\s]+),`).exec(src)
  if (!m) throw new Error(`no HANDLER_TIMEOUT_MS entry for "${jobType}" in worker.ts`)
  const parts = m[1].split("*").map((p) => Number(p.trim().replace(/_/g, "")))
  return parts.reduce((a, b) => a * b, 1)
}

describe("market.collect — slice budget vs handler budget", () => {
  it("reads a market.collect budget out of worker.ts", () => {
    expect(workerBudgetMs("market.collect")).toBe(300_000)
  })

  it("leaves room for a full preset after the slice deadline", () => {
    // The deadline is checked AFTER a preset completes, so the true worst
    // case is slice budget + one slowest preset. That must stay under the
    // handler budget, or a slice can still be killed mid-hand-off.
    const budget = workerBudgetMs("market.collect")
    expect(COLLECT_SLICE_MS + COLLECT_SLOWEST_PRESET_MS).toBeLessThan(budget)
  })

  it("keeps at least a 1.4× margin under the handler budget", () => {
    const budget = workerBudgetMs("market.collect")
    const worstCase = COLLECT_SLICE_MS + COLLECT_SLOWEST_PRESET_MS
    expect(budget / worstCase).toBeGreaterThanOrEqual(1.4)
  })

  it("is large enough that the default two sources still finish in ONE slice", () => {
    // Measured 2026-07-26: 30 presets over youtube + podcast_apple ≈ 41s.
    // The slice must comfortably exceed that, so turning slicing on does not
    // change behaviour for the default (ungrounded) configuration.
    const MEASURED_DEFAULT_FULL_RUN_MS = 41_000
    expect(COLLECT_SLICE_MS).toBeGreaterThan(MEASURED_DEFAULT_FULL_RUN_MS * 2)
  })
})

// ─── Cursor arithmetic (mirrors the handler's while-loop) ────────────

/** Walk the preset list the way the handler does, returning one entry per
 *  slice. `costMs` is the simulated wall time of a single preset. */
function walkSlices(total: number, costMs: number, sliceMs: number) {
  const slices: Array<{ start: number; end: number; completed: boolean }> = []
  let start = 0
  // Hard stop so a cursor bug shows up as a failed assertion, not a hang.
  for (let guard = 0; guard < 1000; guard++) {
    let cursor = start
    let elapsed = 0
    while (cursor < total) {
      elapsed += costMs
      cursor++
      if (cursor < total && elapsed >= sliceMs) break
    }
    const completed = cursor >= total
    slices.push({ start, end: cursor, completed })
    if (completed) return slices
    start = cursor
  }
  throw new Error("slice walk did not terminate")
}

describe("market.collect — slice cursor partitions the preset list", () => {
  it("finishes 30 ungrounded presets in a single slice", () => {
    // ~1.4s per preset measured (41s / 30).
    const slices = walkSlices(30, 1_400, COLLECT_SLICE_MS)
    expect(slices).toHaveLength(1)
    expect(slices[0]).toEqual({ start: 0, end: 30, completed: true })
  })

  it("splits 30 grounded presets into several completing slices", () => {
    // ~22.7s per preset measured with web_grounded enabled.
    const slices = walkSlices(30, 22_700, COLLECT_SLICE_MS)
    expect(slices.length).toBeGreaterThan(1)
    expect(slices.at(-1)!.completed).toBe(true)
    expect(slices.at(-1)!.end).toBe(30)
    // Every slice must fit the budget with its hand-off.
    for (const s of slices) {
      const presetsInSlice = s.end - s.start
      expect(presetsInSlice * 22_700).toBeLessThan(workerBudgetMs("market.collect"))
    }
  })

  it("covers every preset exactly once — no gap, no repeat", () => {
    for (const cost of [1_400, 22_700, 60_000, 400_000]) {
      const slices = walkSlices(30, cost, COLLECT_SLICE_MS)
      const visited = slices.flatMap((s) =>
        Array.from({ length: s.end - s.start }, (_, i) => s.start + i),
      )
      expect(visited).toEqual(Array.from({ length: 30 }, (_, i) => i))
    }
  })

  it("always advances — a preset slower than the whole slice still makes progress", () => {
    // Pathological: one preset costs more than the entire slice budget. The
    // deadline check happens AFTER the preset, so the slice still commits
    // one preset and hands over. Without that ordering the cursor would
    // never move and the chain would loop forever.
    const slices = walkSlices(5, COLLECT_SLICE_MS * 10, COLLECT_SLICE_MS)
    expect(slices).toHaveLength(5)
    for (const s of slices) expect(s.end - s.start).toBe(1)
    expect(slices.at(-1)!.completed).toBe(true)
  })

  it("completes a single-preset run in one slice regardless of cost", () => {
    // The `preset` payload path (operator "refresh now" for one preset).
    const slices = walkSlices(1, COLLECT_SLICE_MS * 10, COLLECT_SLICE_MS)
    expect(slices).toEqual([{ start: 0, end: 1, completed: true }])
  })
})

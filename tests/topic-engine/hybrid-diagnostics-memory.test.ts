/**
 * Topic-engine defect #19 (diagnostic thresholds) — readiness counted
 * "worked" memory per EIR with its own thresholds (score ≥ 0.6 strong,
 * < 0.4 weak, no minimum sample), while the generator's gate reads
 * buildWorkedReport (per topic_domain bucket, ≥ 3 episodes, mean ≥ 0.6 /
 * ≤ 0.35). So the diagnostics could report `has_memory = true` — and let the
 * action through as "foundational" — while the generator then saw empty
 * domain lists and returned `no_inputs`.
 *
 * Readiness now reads the same report, so the two can never disagree.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const h = vi.hoisted(() => ({
  execute: vi.fn(),
  report: vi.fn(),
}))
vi.mock("@/lib/db", () => ({ db: { execute: h.execute } }))
vi.mock("@/lib/khat-brain/performance-learning", () => ({ buildWorkedReport: h.report }))

import { getHybridReadiness } from "@/lib/hybrid-topics/diagnostics"

const EMPTY = {
  generated_at: "x",
  top_episodes: [],
  weak_episodes: [],
  strong_topic_domains: [],
  weak_topic_domains: [],
  strong_episode_types: [],
  weak_episode_types: [],
  strong_guests: [],
  recommendations: [],
}

beforeEach(() => {
  h.execute.mockReset()
  // Every count query answers with a single row; the per-EIR performance
  // query (if anyone still ran it) would claim 2 strong + 1 weak EIRs.
  h.execute.mockResolvedValue({
    rows: [{ total: 0, extracted: 0, scored: 0, n: 0, strong: 2, weak: 1, collect: 0, extract: 0, score: 0, cluster: 0 }],
  })
})

describe("getHybridReadiness — memory uses the generator's own rule", () => {
  it("no qualifying domain bucket → no memory, even if single EIRs scored high", async () => {
    h.report.mockResolvedValue(EMPTY)
    const r = await getHybridReadiness()
    expect(r.has_memory).toBe(false)
    expect(r.worked_strong_domains).toBe(0)
    expect(r.blocking_reason).toBe("no_inputs")
  })

  it("a qualifying bucket → memory, counted in domains", async () => {
    h.report.mockResolvedValue({
      ...EMPTY,
      strong_topic_domains: [{ key: "relationships", sample_size: 3, mean_score: 0.7, median_views: null }],
    })
    const r = await getHybridReadiness()
    expect(r.has_memory).toBe(true)
    expect(r.worked_strong_domains).toBe(1)
    expect(r.worked_weak_domains).toBe(0)
  })
})

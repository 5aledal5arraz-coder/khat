/**
 * The admin home's five-stage funnel — the properties it is allowed to have.
 *
 * The funnel replaced a 13-cell phase grid. Two things had to survive that
 * replacement, and both are asserted here rather than left to a visual read:
 *   1. Σ stage counts === the headline number printed above them. The old grid
 *      failed exactly this invariant once already (see the note on
 *      `derivePipelineSummary`), which is why it is locked.
 *   2. No phase is lost or double-counted. Coverage is a compile-time property
 *      of `lib/khat-brain/pipeline-stages.ts`; DISJOINTNESS is not expressible
 *      in the type system, so it is checked here.
 */

import { describe, it, expect } from "vitest"
import {
  PIPELINE_STAGES,
  NON_TERMINAL_PHASES,
  TERMINAL_PHASES,
  resolveStage,
} from "@/lib/khat-brain/pipeline-stages"
import {
  derivePipelineFunnel,
  derivePipelineSummary,
} from "@/lib/ops/home-metrics"
import { EPISODE_PHASES, type EpisodePhase } from "@/lib/db/schema/eir"

const LABELS = Object.fromEntries(
  EPISODE_PHASES.map((p) => [p, `label:${p}`]),
) as Record<EpisodePhase, string>

const counts = (over: Partial<Record<EpisodePhase, number>>) =>
  Object.fromEntries(
    EPISODE_PHASES.map((p) => [p, over[p] ?? 0]),
  ) as Record<EpisodePhase, number>

const funnelFor = (over: Partial<Record<EpisodePhase, number>>) => {
  const summary = derivePipelineSummary(
    { countByPhase: counts(over) },
    LABELS,
    TERMINAL_PHASES,
  )!
  return { summary, groups: derivePipelineFunnel(summary) }
}

// ─── The partition ───────────────────────────────────────────────────

describe("PIPELINE_STAGES partitions the non-terminal phases", () => {
  it("covers every non-terminal phase", () => {
    const mapped = PIPELINE_STAGES.flatMap((s) => [...s.phases])
    expect([...mapped].sort()).toEqual([...NON_TERMINAL_PHASES].sort())
  })

  it("never places a phase in two stages", () => {
    const mapped = PIPELINE_STAGES.flatMap((s) => [...s.phases])
    expect(new Set(mapped).size).toBe(mapped.length)
  })

  it("excludes the terminal phases entirely", () => {
    const mapped = new Set<string>(PIPELINE_STAGES.flatMap((s) => [...s.phases]))
    expect(mapped.has("published")).toBe(false)
    expect(mapped.has("archived")).toBe(false)
  })

  it("keeps the stages in lifecycle order", () => {
    // Each stage's FIRST phase must come after the previous stage's LAST one
    // in `EPISODE_PHASES` — the funnel's whole claim is that it reads left to
    // right (start to finish), and a grid that wrapped was what lost it.
    const idx = (p: string) => (EPISODE_PHASES as readonly string[]).indexOf(p)
    for (let i = 1; i < PIPELINE_STAGES.length; i++) {
      const prev = PIPELINE_STAGES[i - 1].phases
      const cur = PIPELINE_STAGES[i].phases
      expect(idx(cur[0])).toBeGreaterThan(idx(prev[prev.length - 1]))
    }
  })

  it("resolves a known key and REFUSES an unknown one", () => {
    expect(resolveStage("preparation")?.phases).toContain("researching")
    // null, not an empty phase list: an empty `inArray` would render as
    // "no episodes in this stage", which is a lie the operator can't see.
    expect(resolveStage("bogus")).toBeNull()
    expect(resolveStage(undefined)).toBeNull()
    expect(resolveStage("")).toBeNull()
  })
})

// ─── The locked invariant ────────────────────────────────────────────

describe("derivePipelineFunnel — the groups sum to the headline", () => {
  it("holds on a realistic distribution", () => {
    const { summary, groups } = funnelFor({
      idea: 3,
      guest_discovery: 1,
      researching: 2,
      recorded: 4,
      producing: 2,
      learned: 1,
      published: 41,
      archived: 7,
    })
    expect(groups.reduce((s, g) => s + g.count, 0)).toBe(summary.inPipeline)
    expect(summary.inPipeline).toBe(13)
  })

  it("holds when EVERY non-terminal phase is populated", () => {
    const { summary, groups } = funnelFor(
      Object.fromEntries(NON_TERMINAL_PHASES.map((p) => [p, 1])),
    )
    expect(groups.reduce((s, g) => s + g.count, 0)).toBe(summary.inPipeline)
    expect(summary.inPipeline).toBe(NON_TERMINAL_PHASES.length)
  })

  it("holds on an empty pipeline, with no NaN bar widths", () => {
    const { summary, groups } = funnelFor({})
    expect(summary.inPipeline).toBe(0)
    expect(groups.reduce((s, g) => s + g.count, 0)).toBe(0)
    for (const g of groups) expect(g.sharePct).toBe(0)
  })

  it("never counts published or archived into any group", () => {
    const { summary, groups } = funnelFor({ published: 41, archived: 7 })
    expect(summary.inPipeline).toBe(0)
    expect(groups.every((g) => g.count === 0)).toBe(true)
  })

  it("renders exactly five groups, in stage order", () => {
    const { groups } = funnelFor({ idea: 1 })
    expect(groups).toHaveLength(5)
    expect(groups.map((g) => g.key)).toEqual(PIPELINE_STAGES.map((s) => s.key))
  })
})

// ─── The bar is a real proportion, not a peak ratio ──────────────────

describe("sharePct is a share of the pipeline, not of the largest cell", () => {
  it("sums to 100% across the five stages", () => {
    const { groups } = funnelFor({ idea: 1, researching: 1, producing: 2 })
    const total = groups.reduce((s, g) => s + g.sharePct, 0)
    expect(total).toBeCloseTo(100, 6)
  })

  it("does NOT paint every populated stage full when the counts are equal", () => {
    // The exact defect in the old `count / peak` bars: five stages holding one
    // record each rendered five 100% bars.
    const { groups } = funnelFor({
      idea: 1,
      researching: 1,
      recording: 1,
      producing: 1,
      analyzing: 1,
    })
    for (const g of groups) expect(g.sharePct).toBeCloseTo(20, 6)
  })
})

// ─── The links keep their promise ────────────────────────────────────

describe("every funnel tile links to its OWN episodes, filtered", () => {
  it("points at the episodes index with its stage key", () => {
    const { groups } = funnelFor({ idea: 1 })
    for (const g of groups) {
      expect(g.href).toBe(`/admin/khat-brain/episodes?stage=${g.key}`)
      // And the index can actually resolve what the link sends it.
      expect(resolveStage(g.key)).not.toBeNull()
    }
  })
})

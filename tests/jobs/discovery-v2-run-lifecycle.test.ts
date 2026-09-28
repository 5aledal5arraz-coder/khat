/**
 * discovery_v2.run used to write `discovery_runs.status` with its own UPDATE,
 * bypassing `transitionDiscoveryRun` / `bumpCandidateCount`. Every v2 run
 * therefore showed candidate_count=0 with null started_at/completed_at, and a
 * failed run had no error_message.
 *
 * The run store here is in memory, but its transition guard is the REAL
 * `canTransitionRun` — an illegal hop (the old pending → searching) throws
 * exactly as the real `transitionDiscoveryRun` does.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { DiscoveryRunStatus } from "@/lib/db/schema/discovery"

type Run = {
  id: string
  status: DiscoveryRunStatus
  season_id: string | null
  seed_prompt: string | null
  source_config: Record<string, unknown> | null
  candidate_count: number
  started_at: string | null
  completed_at: string | null
  error_message: string | null
}

const store = vi.hoisted(() => ({ run: null as unknown as Run, hops: [] as string[] }))

vi.mock("@/lib/discovery/runs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/discovery/runs")>()
  return {
    canTransitionRun: actual.canTransitionRun,
    getDiscoveryRun: vi.fn(async () => ({ ...store.run })),
    transitionDiscoveryRun: vi.fn(
      async (i: { id: string; to: DiscoveryRunStatus; error?: string | null }) => {
        const cur = store.run
        if (cur.status === i.to) return { ...cur }
        if (!actual.canTransitionRun(cur.status, i.to)) {
          throw new actual.InvalidDiscoveryTransitionError(cur.status, i.to)
        }
        store.hops.push(`${cur.status}→${i.to}`)
        cur.status = i.to
        if (i.to === "seeding" && !cur.started_at) cur.started_at = "t-start"
        if (["completed", "failed", "cancelled"].includes(i.to)) cur.completed_at = "t-end"
        if (i.error !== undefined) cur.error_message = i.error
        return { ...cur }
      },
    ),
    bumpCandidateCount: vi.fn(async (_id: string, d: number) => {
      store.run.candidate_count += d
    }),
    setDiscoveryRunSourceConfig: vi.fn(async (_id: string, cfg: Record<string, unknown>) => {
      store.run.source_config = cfg
    }),
  }
})

let seq = 0
vi.mock("@/lib/discovery/candidates", () => ({
  createCandidate: vi.fn(async () => ({ id: `cand-${++seq}` })),
  setCandidateStatus: vi.fn(async () => undefined),
}))

const runV2Discovery = vi.hoisted(() => vi.fn())
vi.mock("@/lib/discovery-v2/pipeline", () => ({ runV2Discovery }))

import { getHandler, type JobContext } from "@/lib/jobs"
import { NonRetryableJobError } from "@/lib/jobs/types"
import { v2RunFailureMessage } from "@/lib/discovery-v2/run-failure"
import { createCandidate } from "@/lib/discovery/candidates"
import "@/lib/jobs/handlers/discovery-v2"

function candidate(name: string, decision: "accepted" | "shortlist" | "rejected") {
  return {
    name,
    name_en: null,
    role: "باحث",
    country: "الكويت",
    decision,
    scores: { overall: 0.8 },
    reasons: ["سبب"],
    why: "لأن",
    wiki: { resolved: true, qid: `Q-${name}`, social: {} },
    signals: {},
    grounded: null,
  }
}

const STATS = { proposed: 4, resolved: 3, accepted: 1, shortlist: 1, rejected: 1 }

async function run() {
  const handler = getHandler("discovery_v2.run")!
  return handler({ run_id: "run-1" }, {} as JobContext)
}

beforeEach(() => {
  vi.clearAllMocks()
  seq = 0
  store.hops = []
  store.run = {
    id: "run-1",
    status: "pending",
    season_id: null,
    seed_prompt: "التاريخ",
    source_config: { engine: "v2", topic: "التاريخ", limit: 12 },
    candidate_count: 0,
    started_at: null,
    completed_at: null,
    error_message: null,
  }
})

describe("discovery_v2.run — run lifecycle", () => {
  it("walks the legal path, counts every candidate, and stamps both timestamps", async () => {
    runV2Discovery.mockResolvedValue({
      candidates: [candidate("أ", "accepted"), candidate("ب", "shortlist"), candidate("ج", "rejected")],
      proposeRunId: "ai-1",
      stats: STATS,
    })

    await run()

    expect(store.hops).toEqual([
      "pending→seeding",
      "seeding→searching",
      "searching→verifying",
      "verifying→ranking",
      "ranking→completed",
    ])
    expect(store.run.status).toBe("completed")
    expect(store.run.candidate_count).toBe(3)
    expect(store.run.started_at).not.toBeNull()
    expect(store.run.completed_at).not.toBeNull()
    expect(store.run.source_config).toMatchObject({ topic: "التاريخ", v2_stats: STATS })
  })

  it("is 'searching' — with started_at — while the pipeline runs", async () => {
    runV2Discovery.mockImplementation(async () => {
      expect(store.run.status).toBe("searching")
      expect(store.run.started_at).not.toBeNull()
      return { candidates: [], proposeRunId: null, stats: STATS }
    })
    await run()
    expect(store.run.status).toBe("completed")
    expect(store.run.candidate_count).toBe(0)
  })

  it("a zero-names run fails the run AND the job — terminal, with the Arabic reason", async () => {
    runV2Discovery.mockResolvedValue({
      candidates: [],
      proposeRunId: null,
      stats: { proposed: 0, resolved: 0, accepted: 0, shortlist: 0, rejected: 0 },
      error: "no names proposed",
      errorKind: "no_names",
    })

    // It used to RETURN here, so the worker stamped the job `succeeded`
    // while the run said «فشل». Throwing NonRetryableJobError makes the
    // worker dead-letter it at once with this message as error_message.
    const err = await run().then(
      () => null,
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(NonRetryableJobError)
    const reason = `${v2RunFailureMessage("no_names")} (no names proposed)`
    expect((err as Error).message).toBe(reason)

    expect(store.run.status).toBe("failed")
    expect(store.run.error_message).toBe(reason)
    expect(store.run.completed_at).not.toBeNull()
    expect(store.run.source_config).toMatchObject({ v2_error: "no names proposed", v2_error_kind: "no_names" })
  })

  it("a propose TIMEOUT fails the job with the timeout copy, never «جرّب موضوعاً أوسع»", async () => {
    // The prod shape (2026-09-28, episode 93c83176).
    runV2Discovery.mockResolvedValue({
      candidates: [],
      proposeRunId: "ai-1",
      stats: { proposed: 0, resolved: 0, accepted: 0, shortlist: 0, rejected: 0 },
      error: "Provider timeout after 300000ms",
      errorKind: "propose_timeout",
    })
    const err = (await run().catch((e: unknown) => e)) as Error
    expect(err).toBeInstanceOf(NonRetryableJobError)
    expect(err.message).toContain("انتهت مهلة اقتراح الأسماء")
    expect(err.message).not.toContain("موضوعاً أوسع")
    expect(store.run.status).toBe("failed")
    expect(store.run.source_config).toMatchObject({ v2_error_kind: "propose_timeout" })
  })

  it("fails the run (not stuck in searching) when the pipeline throws", async () => {
    runV2Discovery.mockRejectedValue(new Error("wikidata down"))
    await expect(run()).rejects.toThrow("wikidata down")
    expect(store.run.status).toBe("failed")
    expect(store.run.error_message).toBe("wikidata down")
  })

  it("fails the run, keeping the partial count, when persisting a candidate throws", async () => {
    runV2Discovery.mockResolvedValue({
      candidates: [candidate("أ", "accepted"), candidate("ب", "shortlist")],
      proposeRunId: null,
      stats: STATS,
    })
    vi.mocked(createCandidate)
      .mockResolvedValueOnce({ id: "cand-1" } as never)
      .mockRejectedValueOnce(new Error("insert failed"))

    await expect(run()).rejects.toThrow("insert failed")
    expect(store.run.status).toBe("failed")
    expect(store.run.candidate_count).toBe(1)
  })
})

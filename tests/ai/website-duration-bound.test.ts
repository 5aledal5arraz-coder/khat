/**
 * ص-٨ — the timestamp duration bound, and what a stored `0` means.
 *
 * `app/api/admin/studio/route.ts` writes `duration_seconds: 0` when the
 * YouTube ISO-8601 duration fails to parse, so a 0 that reaches a
 * generator means "the fetch failed", never "this episode is zero
 * seconds long". A bound of 0 rejects every row but the one at 0s, which
 * is a silently near-empty index — strictly worse than not checking at
 * all.
 *
 * `lib/studio/push-to-episode.ts` already normalises this in
 * `resolveSessionDuration`; this file asserts the generator agrees, so
 * the two ends of the same pipeline cannot drift apart again.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const runAiTask = vi.hoisted(() => vi.fn())
vi.mock("@/lib/ai-router", () => ({ runAiTask }))
vi.mock("@/lib/env", () => ({ env: { OPENAI_API_KEY: "test-key" } }))
vi.mock("@/lib/ai/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/client")>(
    "@/lib/ai/client",
  )
  return {
    ...actual,
    prepareTranscript: vi.fn(async (_c: unknown, t: string) => t),
    prepareTranscriptWithPositions: vi.fn(async (_c: unknown, t: string) => t),
  }
})

import { generateWebsitePackage } from "@/lib/ai/website"

const TIMESTAMPS = [
  { time_seconds: 0, title: "كيف بدأ كل شيء", description: "تقديم الحلقة." },
  { time_seconds: 1320, title: "سقوط الرها", description: "الحصار يبدأ." },
  { time_seconds: 2400, title: "نهاية عماد الدين", description: null },
]

function mockRun(timestamps: unknown[]) {
  runAiTask
    .mockResolvedValueOnce({
      status: "succeeded",
      parsed: { timestamps },
      runId: "run-ts",
    })
    .mockResolvedValueOnce({
      status: "succeeded",
      parsed: {
        hero_summary: "ملخّص قصير",
        full_summary: "ملخّص كامل",
        takeaways: ["خلاصة"],
        quotes: [],
        resources: [],
      },
      runId: "run-ed",
    })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("website package — timestamp duration bound", () => {
  it("treats a stored 0 duration as unknown, not as a zero-length episode", async () => {
    mockRun(TIMESTAMPS)
    const result = await generateWebsitePackage("نص الحلقة", "عنوان", 0)

    expect(result.success).toBe(true)
    // A 0 means the duration fetch failed. Every row must survive, exactly
    // as it does for `null` — not just the one that happens to sit at 0s.
    expect(result.data!.timestamps.map((t) => t.time_seconds)).toEqual([0, 1320, 2400])
  })

  it("checks nothing when the duration is unknown", async () => {
    mockRun(TIMESTAMPS)
    const result = await generateWebsitePackage("نص الحلقة", "عنوان", null)

    expect(result.data!.timestamps).toHaveLength(3)
  })

  it("still rejects rows past the end when the duration is known", async () => {
    mockRun([...TIMESTAMPS, { time_seconds: 7200, title: "بعد النهاية", description: null }])
    const result = await generateWebsitePackage("نص الحلقة", "عنوان", 5178)

    expect(result.data!.timestamps.map((t) => t.time_seconds)).toEqual([0, 1320, 2400])
  })

  it("treats a negative duration as unknown too", async () => {
    mockRun(TIMESTAMPS)
    const result = await generateWebsitePackage("نص الحلقة", "عنوان", -1)

    expect(result.data!.timestamps).toHaveLength(3)
  })

  it("treats a NaN duration as unknown", async () => {
    mockRun(TIMESTAMPS)
    const result = await generateWebsitePackage("نص الحلقة", "عنوان", Number.NaN)

    expect(result.data!.timestamps).toHaveLength(3)
  })
})

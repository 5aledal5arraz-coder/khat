/**
 * ص-١٠ — the summarizer scaffold must not reach a published field.
 *
 * The first fix cleaned `hero_summary` / `full_summary` / `takeaways`,
 * which measured CLEAN in the live output (zero occurrences). The field
 * that was actually dirty is `timestamps[].description` — 17 occurrences
 * — and it was passed through untouched. That is the field that lands in
 * `episode_enrichments.timestamps` and renders on the public episode
 * page, so this test guards the real leak, not the imagined one.
 *
 * The reason it leaks THERE and nowhere else is structural: the timestamp
 * prompt is the one that instructs the model to read the
 * `[الجزء X/Y — من الدقيقة…]` labels, so that is the call that echoes them.
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
    // Skip the summarizer round-trip; this test is about output cleaning.
    prepareTranscript: vi.fn(async (_c: unknown, t: string) => t),
    prepareTranscriptWithPositions: vi.fn(async (_c: unknown, t: string) => t),
  }
})

import { generateWebsitePackage } from "@/lib/ai/website"

/** Verbatim shapes taken from the captured live output. */
const DIRTY_TIMESTAMPS = [
  {
    time_seconds: 0,
    title: "كيف بدأ كل شيء",
    description: "[الجزء 1/6 — تقريباً من الدقيقة 0 إلى الدقيقة 36] تقديم الحلقة.",
  },
  {
    time_seconds: 1320,
    title: "سقوط الرها [الجزء 2/6]",
    description: "الجزء 3/6 — من الدقيقة 72 إلى 108: الحصار يبدأ.",
  },
  {
    time_seconds: 2400,
    title: "نهاية عماد الدين",
    description: null,
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  runAiTask
    .mockResolvedValueOnce({
      status: "succeeded",
      parsed: { timestamps: DIRTY_TIMESTAMPS },
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
})

describe("website package — scaffold leakage", () => {
  it("strips the scaffold from timestamp descriptions", async () => {
    const result = await generateWebsitePackage("نص الحلقة", "عنوان", 12954)

    expect(result.success).toBe(true)
    for (const ts of result.data!.timestamps) {
      expect(ts.description ?? "").not.toMatch(/الجزء\s*\d+\s*\//)
      expect(ts.title).not.toMatch(/الجزء\s*\d+\s*\//)
    }
  })

  it("keeps the surrounding prose intact", async () => {
    const result = await generateWebsitePackage("نص الحلقة", "عنوان", 12954)

    const descriptions = result.data!.timestamps.map((t) => t.description ?? "")
    expect(descriptions[0]).toContain("تقديم الحلقة")
    expect(descriptions[1]).toContain("الحصار يبدأ")
    expect(result.data!.timestamps[1].title).toContain("سقوط الرها")
  })

  it("leaves a null description as null", async () => {
    const result = await generateWebsitePackage("نص الحلقة", "عنوان", 12954)
    expect(result.data!.timestamps[2].description).toBeNull()
  })
})

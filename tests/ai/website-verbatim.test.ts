/**
 * The website-package generator must not hand back a quote the guest never
 * said. It is checked against the FULL transcript — not the chunk summary the
 * editorial prompt reads for a long episode, because a sentence that exists
 * only in the summary is the summariser's sentence.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const runAiTask = vi.hoisted(() => vi.fn())
vi.mock("@/lib/ai-router", () => ({ runAiTask }))
vi.mock("@/lib/env", () => ({ env: { OPENAI_API_KEY: "test-key" } }))
const SUMMARY_ONLY = "تجربة الأسر علمتني قيمة الحياة والحرية"
vi.mock("@/lib/ai/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/client")>("@/lib/ai/client")
  return {
    ...actual,
    // The "summary" the model reads carries a sentence the transcript does not.
    prepareTranscript: vi.fn(async (_c: unknown, t: string) => `${t}\n${SUMMARY_ONLY}`),
    prepareTranscriptWithPositions: vi.fn(async (_c: unknown, t: string) => t),
  }
})

import { generateWebsitePackage } from "@/lib/ai/website"

const TRANSCRIPT =
  "الضيف: يوم دخلت الاسر ما كنت اعرف اني بطلع منه. الحريه ما تعرف قيمتها الا اذا انسلبت منك."

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "warn").mockImplementation(() => {})
  runAiTask
    .mockResolvedValueOnce({ status: "succeeded", parsed: { timestamps: [] }, runId: "run-ts" })
    .mockResolvedValueOnce({
      status: "succeeded",
      parsed: {
        hero_summary: "ملخّص قصير",
        full_summary: "ملخّص كامل",
        takeaways: [],
        quotes: [
          { text: "الحرية ما تعرف قيمتها إلا إذا انسلبت منك", theme: "الحرية", speaker: "guest" },
          { text: SUMMARY_ONLY, theme: "الأسر", speaker: "guest" },
        ],
        resources: [],
      },
      runId: "run-ed",
    })
})

describe("website package — verbatim quote guard", () => {
  it("keeps the real quote, drops the fabricated one, and records the drop", async () => {
    const result = await generateWebsitePackage(TRANSCRIPT, "عنوان", 1800)

    expect(result.success).toBe(true)
    expect(result.data!.quotes.map((q) => q.text)).toEqual([
      "الحرية ما تعرف قيمتها إلا إذا انسلبت منك",
    ])
    expect(result.raw!.quotes_dropped_not_verbatim).toBe(1)
    expect(result.raw!.quotes_dropped_texts).toEqual([SUMMARY_ONLY])
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("dropped 1 quote"))
  })

  it("tells the model to copy exact spans", async () => {
    await generateWebsitePackage(TRANSCRIPT, "عنوان", 1800)
    const system = runAiTask.mock.calls[1][0].prompt[0].content as string
    expect(system).toContain("منسوخاً حرفياً")
  })
})

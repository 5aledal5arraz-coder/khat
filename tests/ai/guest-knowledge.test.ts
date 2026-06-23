/**
 * P5 — Studio redesign: guest knowledge synthesis.
 *
 * Locks the output normalization (string-array filtering, ≤4 notable quotes,
 * arc default) and that the prompt is grounded in the supplied signals.
 */

import { describe, expect, it, vi, beforeEach } from "vitest"

const runAiTaskMock = vi.fn()
vi.mock("@/lib/ai-router", () => ({
  runAiTask: (args: unknown) => runAiTaskMock(args),
}))

import { generateGuestKnowledge } from "@/lib/ai/guest-knowledge"

beforeEach(() => {
  runAiTaskMock.mockReset()
  process.env.OPENAI_API_KEY = "test-key"
})

describe("generateGuestKnowledge", () => {
  it("normalizes the parsed output (filters empties, caps quotes at 4, defaults arc)", async () => {
    runAiTaskMock.mockResolvedValue({
      status: "succeeded",
      modelName: "test",
      runId: "r1",
      parsed: {
        headline: "روائي",
        bio: "نبذة",
        signature_topics: ["الأدب", "", "  ", "المنفى"],
        themes: ["الحرب"],
        notable_quotes: [
          { text: "q1" }, { text: "q2", context: "c" }, { text: "q3" }, { text: "q4" }, { text: "q5" },
          { text: "" },
        ],
        arc: "تطوّر",
      },
    })

    const res = await generateGuestKnowledge({ guestName: "حسن", episodeTitles: ["حلقة 1"] })
    expect(res.success).toBe(true)
    expect(res.data?.signature_topics).toEqual(["الأدب", "المنفى"])
    expect(res.data?.notable_quotes).toHaveLength(4)
    expect(res.data?.notable_quotes?.[1]).toEqual({ text: "q2", context: "c" })
    expect(res.data?.arc).toBe("تطوّر")
  })

  it("grounds the prompt in the supplied signals (bio, positions, quotes, episodes)", async () => {
    runAiTaskMock.mockResolvedValue({ status: "succeeded", modelName: "t", runId: "r", parsed: { headline: "h", bio: "b" } })
    await generateGuestKnowledge({
      guestName: "حسن بلاسم",
      episodeTitles: ["الكتابة في المنفى"],
      detectedBio: "روائي عراقي",
      keyPositions: ["الأدب مقاومة"],
      quotes: [{ text: "اقتباس مهم" }],
    })
    const arg = runAiTaskMock.mock.calls[0][0] as { prompt: Array<{ content: string }> }
    const user = arg.prompt[1].content
    expect(user).toContain("حسن بلاسم")
    expect(user).toContain("الكتابة في المنفى")
    expect(user).toContain("روائي عراقي")
    expect(user).toContain("الأدب مقاومة")
    expect(user).toContain("اقتباس مهم")
  })

  it("fails cleanly when the response is empty", async () => {
    runAiTaskMock.mockResolvedValue({ status: "succeeded", modelName: "t", runId: "r", parsed: {} })
    const res = await generateGuestKnowledge({ guestName: "x", episodeTitles: [] })
    expect(res.success).toBe(false)
  })

  it("propagates router failure", async () => {
    runAiTaskMock.mockResolvedValue({ status: "failed", errorMessage: "boom", runId: "r" })
    const res = await generateGuestKnowledge({ guestName: "x", episodeTitles: [] })
    expect(res.success).toBe(false)
    expect(res.error).toBe("boom")
  })
})

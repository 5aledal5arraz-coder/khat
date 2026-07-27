/**
 * ص-١٠ — the phantom sixth part, and the silent 100k cut.
 *
 * `splitIntoChunks` backs every chunk off to the last word boundary, so
 * each lands a few chars short of the 20,000 target. Over five chunks
 * that shortfall accumulated into a SIXTH chunk of ten characters, which
 * was then sent as its own paid, labelled call
 * ("الجزء 6/6 — تقريباً من الدقيقة 180 إلى الدقيقة 216"). The model
 * replied «يرجى إرسال نص الجزء السادس…» and that apology was
 * concatenated into the merged summary as though it were a section.
 *
 * Asserted here through the public API, because the thing that matters
 * is how many billable calls go out and what text they carry.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const runAiTask = vi.hoisted(() => vi.fn())
vi.mock("@/lib/ai-router/router", () => ({ runAiTask }))

import { prepareTranscript, prepareTranscriptWithPositions } from "@/lib/ai/client"

/** Arabic-like text of an exact character length, with word boundaries. */
function arabicText(chars: number): string {
  const words: string[] = []
  let n = 0
  while (n < chars) {
    const w = "كلمة".repeat(1 + (words.length % 3))
    words.push(w)
    n += w.length + 1
  }
  return words.join(" ").slice(0, chars)
}

/** The live run's measured transcript length for the 216-minute episode. */
const LIVE_TRANSCRIPT_CHARS = 118_786

function chunkCalls() {
  return runAiTask.mock.calls
    .map((c) => c[0] as { input?: { phase?: string }; prompt: { content: string }[] })
    .filter((a) => a.input?.phase?.includes("chunk_summary"))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  runAiTask.mockResolvedValue({ status: "succeeded", rawText: "ملخّص" })
})

describe("transcript chunking", () => {
  it("does not emit a runt final chunk for the live episode length", async () => {
    // A distinct length per test keeps the content-hash memo from sharing
    // results between cases.
    await prepareTranscript({} as never, arabicText(LIVE_TRANSCRIPT_CHARS))

    const calls = chunkCalls()
    expect(calls).toHaveLength(5) // was 6 — the sixth was 10 chars
    for (const call of calls) {
      expect(call.prompt.at(-1)!.content.length).toBeGreaterThanOrEqual(500)
    }
  })

  it("keeps the runt's text — it is folded in, not dropped", async () => {
    const text = arabicText(LIVE_TRANSCRIPT_CHARS - 1)
    await prepareTranscript({} as never, text)

    const sent = chunkCalls()
      .map((c) => c.prompt.at(-1)!.content)
      .join(" ")
    // The last words that survive the 100k cap must still be present.
    const lastKeptWord = text.slice(0, 100_000).trim().split(" ").at(-1)!
    expect(sent).toContain(lastKeptWord)
  })

  it("warns loudly when the 100k cap drops the end of the episode", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    await prepareTranscript({} as never, arabicText(LIVE_TRANSCRIPT_CHARS - 2))

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("TRANSCRIPT TRUNCATED"),
    )
    expect(warn.mock.calls[0][0]).toMatch(/18,?78\d chars \(15\.8%\)/)
  })

  it("records the dropped chars on the ai_runs input snapshot", async () => {
    await prepareTranscript({} as never, arabicText(LIVE_TRANSCRIPT_CHARS - 3))

    const input = chunkCalls()[0].input as { transcriptDroppedChars?: number }
    expect(input.transcriptDroppedChars).toBeGreaterThan(18_000)
  })

  it("stays silent when nothing is truncated", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    await prepareTranscript({} as never, arabicText(60_000))

    expect(warn).not.toHaveBeenCalled()
  })

  it("labels the positional chunks 1..N with no phantom tail", async () => {
    await prepareTranscriptWithPositions(
      {} as never,
      arabicText(LIVE_TRANSCRIPT_CHARS - 4),
      216 * 60,
    )

    const calls = chunkCalls()
    expect(calls).toHaveLength(5)
    const system = calls.at(-1)!.prompt[0].content
    expect(system).toContain("الجزء 5/5")
    // The 180→216 minute label belonged to the ten-char phantom part.
    expect(system).not.toContain("الجزء 6/6")
  })
})

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
  it("covers the WHOLE reference episode — no cap, no runt", async () => {
    // B′ — the 100k cap used to cut this episode at char 100,032, which is
    // where its last 37 minutes begin. Six chunks now, and every one of
    // them a real section: the runt-folding from ص-١٠ still holds at the
    // new length.
    await prepareTranscript({} as never, arabicText(LIVE_TRANSCRIPT_CHARS))

    const calls = chunkCalls()
    expect(calls).toHaveLength(6)
    for (const call of calls) {
      expect(call.prompt.at(-1)!.content.length).toBeGreaterThanOrEqual(500)
    }
  })

  it("sends the END of the episode, not just the first 100k", async () => {
    const text = arabicText(LIVE_TRANSCRIPT_CHARS - 1)
    await prepareTranscript({} as never, text)

    const sent = chunkCalls()
      .map((c) => c.prompt.at(-1)!.content)
      .join(" ")
    // The very last word of the transcript — previously 18,786 chars past
    // the cap and therefore invisible to every generator.
    const lastWord = text.trim().split(" ").at(-1)!
    expect(sent).toContain(lastWord)
  })

  it("never emits a chunk under 500 chars, at any input length", async () => {
    // The runt came from word-boundary backoff accumulating, so it appears
    // only at particular lengths. Sweep instead of guessing one.
    for (const len of [40_010, 60_003, 99_998, 119_991, 140_007]) {
      vi.clearAllMocks()
      runAiTask.mockResolvedValue({ status: "succeeded", rawText: "ملخّص" })
      await prepareTranscript({} as never, arabicText(len))
      for (const call of chunkCalls()) {
        expect(call.prompt.at(-1)!.content.length).toBeGreaterThanOrEqual(500)
      }
    }
  })

  it("stays silent for any realistic episode — the cap no longer fires", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    await prepareTranscript({} as never, arabicText(LIVE_TRANSCRIPT_CHARS - 2))

    expect(warn).not.toHaveBeenCalled()
  })

  it("still warns loudly if the (now much higher) cap is ever hit", async () => {
    // The cap survives as a COST bound, not a content decision — chunk
    // count grows linearly with input and every chunk is a paid call. If
    // it ever fires it must still be impossible to miss.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    await prepareTranscript({} as never, arabicText(420_000))

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("TRANSCRIPT TRUNCATED"),
    )
    expect(chunkCalls()[0].input).toMatchObject({
      transcriptDroppedChars: expect.any(Number),
    })
  })

  it("records zero dropped chars when nothing is dropped", async () => {
    await prepareTranscript({} as never, arabicText(LIVE_TRANSCRIPT_CHARS - 3))

    const input = chunkCalls()[0].input as { transcriptDroppedChars?: number }
    expect(input.transcriptDroppedChars).toBe(0)
  })

  it("labels the positional chunks 1..N with no phantom tail", async () => {
    await prepareTranscriptWithPositions(
      {} as never,
      arabicText(LIVE_TRANSCRIPT_CHARS - 4),
      216 * 60,
    )

    const calls = chunkCalls()
    expect(calls).toHaveLength(6)
    const system = calls.at(-1)!.prompt[0].content
    expect(system).toContain("الجزء 6/6")
    // The phantom part was a SEVENTH of ten characters, not the sixth.
    expect(system).not.toContain("الجزء 7/7")
  })
})

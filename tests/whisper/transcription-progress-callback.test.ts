/**
 * The onProgress plumbing is ADDITIVE and SAFE: a missing callback is a no-op
 * (every existing caller + the whole TEXT path is unaffected), and a throwing
 * callback can NEVER abort transcription. `emitTranscriptionProgress` is that
 * exact defensive boundary — tested directly, no ffmpeg, no OpenAI.
 */

import { describe, it, expect, vi } from "vitest"

// whisper.ts pulls in the AI telemetry chain at import; stub the heavy leaves so
// this focused unit doesn't need a DB or the OpenAI SDK's runtime.
vi.mock("@/lib/ai-router/record-run", () => ({ recordAiRun: vi.fn() }))
vi.mock("@/lib/ai-router/router", () => ({ classifyError: vi.fn(() => ({ name: "unknown" })) }))

import { emitTranscriptionProgress } from "@/lib/whisper"

describe("emitTranscriptionProgress — additive-safety boundary", () => {
  it("is a no-op when no callback is provided (the additive default)", () => {
    expect(() => emitTranscriptionProgress(undefined, 3, 12)).not.toThrow()
  })

  it("forwards { currentChunk, totalChunks } to the callback", () => {
    const fn = vi.fn()
    emitTranscriptionProgress(fn, 3, 12)
    expect(fn).toHaveBeenCalledWith({ currentChunk: 3, totalChunks: 12 })
  })

  it("SWALLOWS a throwing callback so it can never abort the transcription loop", () => {
    const fn = vi.fn(() => {
      throw new Error("bad UI callback")
    })
    expect(() => emitTranscriptionProgress(fn, 1, 1)).not.toThrow()
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

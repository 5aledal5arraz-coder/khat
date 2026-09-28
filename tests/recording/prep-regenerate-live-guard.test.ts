/**
 * A full prep_v2 regeneration is refused while a take is running on the prep.
 *
 * The cockpit follows `prep_update` live, and a regeneration replaces the whole
 * bank — new question ids, possibly new sections — under a host reading from
 * it, with the asked set pointing at ids that no longer exist. The guard sits
 * at the pipeline's entry, BEFORE any AI pass, so a refused run costs nothing.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/recording-v2/live-guard", async () => {
  const actual = await vi.importActual<typeof import("@/lib/recording-v2/live-guard")>(
    "@/lib/recording-v2/live-guard",
  )
  return { ...actual, hasActiveRecordingForPreparation: vi.fn() }
})
// Any AI call reaching the router would mean the guard did not stop the run.
vi.mock("@/lib/ai-router/router", () => ({
  runAiTask: vi.fn(async () => {
    throw new Error("AI must not be called while a take is live")
  }),
}))

import { hasActiveRecordingForPreparation, ROOM_LIVE_REGENERATION_MESSAGE } from "@/lib/recording-v2/live-guard"
import { runAiTask } from "@/lib/ai-router/router"
import { runPrepV2Pipeline } from "@/lib/preparation/v2/pipeline"

beforeEach(() => vi.clearAllMocks())

describe("runPrepV2Pipeline while a room on the prep is live/paused", () => {
  it("refuses with reason `room_live` and makes no AI call", async () => {
    vi.mocked(hasActiveRecordingForPreparation).mockResolvedValue(true)
    const r = await runPrepV2Pipeline({ preparationId: "prep-1", force: true })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe("room_live")
    expect(hasActiveRecordingForPreparation).toHaveBeenCalledWith("prep-1")
    expect(runAiTask).not.toHaveBeenCalled()
  })

  it("the operator message is Arabic and says what to do", () => {
    expect(ROOM_LIVE_REGENERATION_MESSAGE).toMatch(/أنهِ التسجيل/)
  })
})

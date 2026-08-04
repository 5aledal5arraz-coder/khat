import { describe, expect, it } from "vitest"

import {
  SEEK_PLAY_SECONDS,
  SEEK_PRE_ROLL_SECONDS,
  resolvePlayback,
} from "@/app/admin/studio/components/stage-episode-map"

/**
 * The "اسمع" button on the raw-recording time map.
 *
 * The defect this locks down: every card used the point-anchor taste (3s early,
 * 8s long), including hook clips that run for MINUTES and whose card summarises
 * the whole clip. Hearing 8 seconds of a clip's opening cannot match a summary
 * of all of it — which reads to the operator as a wrong timestamp even though
 * the timestamp is right (verified against the episode's own YouTube captions).
 */
describe("resolvePlayback — hook clips play whole, anchors stay a taste", () => {
  describe("range (a hook clip: it has an out-point)", () => {
    // Hook #2 of episode 018 — 40:37 → 43:17.
    const start = 40 * 60 + 37
    const end = 43 * 60 + 17

    it("starts exactly on the in-point, with no pre-roll", () => {
      expect(resolvePlayback(start, end).startAt).toBe(start)
    })

    it("plays the clip whole, not an 8-second sample", () => {
      const { playSeconds } = resolvePlayback(start, end)
      expect(playSeconds).toBe(end - start)
      expect(playSeconds).toBeGreaterThan(SEEK_PLAY_SECONDS)
    })

    it("carries the out-point so playback can stop by position", () => {
      expect(resolvePlayback(start, end).stopAt).toBe(end)
    })
  })

  describe("point anchor (no out-point)", () => {
    // «بداية الحلقة الفعلية» — 2:32, verified against the YouTube captions.
    const at = 2 * 60 + 32

    it("keeps the pre-roll so the anchor is not clipped off the front", () => {
      expect(resolvePlayback(at).startAt).toBe(at - SEEK_PRE_ROLL_SECONDS)
    })

    it("keeps the short taste", () => {
      expect(resolvePlayback(at).playSeconds).toBe(SEEK_PLAY_SECONDS)
    })

    it("has no out-point, so nothing stops it by position", () => {
      expect(resolvePlayback(at).stopAt).toBeNull()
    })

    it("never seeks before zero near the start of the file", () => {
      expect(resolvePlayback(1).startAt).toBe(0)
      expect(resolvePlayback(0).startAt).toBe(0)
    })
  })

  describe("degenerate ranges fall back to the anchor behaviour", () => {
    it.each([
      ["end equal to start", 100, 100],
      ["end before start", 100, 90],
    ])("%s", (_label, start, end) => {
      const r = resolvePlayback(start, end)
      expect(r.stopAt).toBeNull()
      expect(r.playSeconds).toBe(SEEK_PLAY_SECONDS)
      expect(r.startAt).toBe(start - SEEK_PRE_ROLL_SECONDS)
    })
  })

  /**
   * Two-direction check: the assertions above must FAIL if the old
   * always-a-taste behaviour comes back, otherwise they prove nothing.
   */
  it("would catch a regression to the old always-8-seconds behaviour", () => {
    const legacy = (at: number) => ({
      startAt: Math.max(0, at - SEEK_PRE_ROLL_SECONDS),
      stopAt: null,
      playSeconds: SEEK_PLAY_SECONDS,
    })
    const start = 40 * 60 + 37
    const end = 43 * 60 + 17
    expect(legacy(start)).not.toEqual(resolvePlayback(start, end))
    // ...while staying identical for a point anchor.
    expect(legacy(152)).toEqual(resolvePlayback(152))
  })
})

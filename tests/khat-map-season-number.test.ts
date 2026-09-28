/**
 * «الموسم 1» for Khaled's SECOND season (2026-09-28 end-to-end test): the new
 * season's number counted planning rows only, and the first season aired
 * before the planning system existed. The aired archive counts now.
 */
import { describe, it, expect } from "vitest"
import { nextSeasonNumberFrom } from "@/lib/khat-map/core/season-number"

describe("nextSeasonNumberFrom", () => {
  it("production's shape: no planning seasons, an aired archive with no season numbers → 2", () => {
    expect(nextSeasonNumberFrom({ planned: [], airedMaxSeason: null, airedEpisodeCount: 41 })).toBe(2)
  })
  it("sight: the old rule (planning rows only) would have said 1", () => {
    expect(nextSeasonNumberFrom({ planned: [], airedMaxSeason: null, airedEpisodeCount: 0 })).toBe(1)
  })
  it("the higher of planned and aired wins", () => {
    expect(nextSeasonNumberFrom({ planned: [1, 2], airedMaxSeason: null, airedEpisodeCount: 41 })).toBe(3)
    expect(nextSeasonNumberFrom({ planned: [null], airedMaxSeason: 3, airedEpisodeCount: 41 })).toBe(4)
  })
})

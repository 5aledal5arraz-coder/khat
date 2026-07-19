/**
 * Teaser publish/expire window rule — acceptance م2.
 *
 * `isTeaserWithinWindow` is the pure predicate used by getActiveTeaserForDisplay
 * (the homepage read path), so covering it here locks the window semantics.
 */

import { describe, it, expect } from "vitest"
import { isTeaserWithinWindow } from "@/lib/teaser"

const NOW = new Date("2026-07-19T12:00:00Z")
const PAST = "2026-07-18T12:00:00Z"
const FUTURE = "2026-07-20T12:00:00Z"

describe("isTeaserWithinWindow (acceptance م2)", () => {
  it("shows a teaser with no window at all", () => {
    expect(isTeaserWithinWindow({ publishAt: null, expireAt: null }, NOW)).toBe(true)
  })

  it("hides a teaser whose publishAt is in the future", () => {
    expect(isTeaserWithinWindow({ publishAt: FUTURE, expireAt: null }, NOW)).toBe(false)
  })

  it("shows a teaser whose publishAt has already passed", () => {
    expect(isTeaserWithinWindow({ publishAt: PAST, expireAt: null }, NOW)).toBe(true)
  })

  it("hides a teaser whose expireAt is in the past", () => {
    expect(isTeaserWithinWindow({ publishAt: null, expireAt: PAST }, NOW)).toBe(false)
  })

  it("shows a teaser whose expireAt is still in the future", () => {
    expect(isTeaserWithinWindow({ publishAt: null, expireAt: FUTURE }, NOW)).toBe(true)
  })

  it("shows a teaser inside a fully-bounded window", () => {
    expect(isTeaserWithinWindow({ publishAt: PAST, expireAt: FUTURE }, NOW)).toBe(true)
  })

  it("hides a teaser before a fully-bounded window opens", () => {
    const soon = "2026-07-19T18:00:00Z"
    const later = "2026-07-19T20:00:00Z"
    expect(isTeaserWithinWindow({ publishAt: soon, expireAt: later }, NOW)).toBe(false)
  })

  it("hides a teaser after a fully-bounded window closes", () => {
    const early = "2026-07-19T06:00:00Z"
    const past = "2026-07-19T08:00:00Z"
    expect(isTeaserWithinWindow({ publishAt: early, expireAt: past }, NOW)).toBe(false)
  })

  it("defaults `now` to the current time when omitted", () => {
    // A window that opened in the far past and never expires is always live.
    expect(isTeaserWithinWindow({ publishAt: "2000-01-01T00:00:00Z", expireAt: null })).toBe(true)
  })
})

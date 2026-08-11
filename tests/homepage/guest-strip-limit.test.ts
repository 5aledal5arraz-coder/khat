/**
 * How many faces the guest strip shows.
 *
 * Three hardcoded numbers used to decide this and none of them was reachable:
 * the auto query stopped gathering at 12, the manual editor offered exactly 3
 * slots, and the dedup against the hero and the episode grid ate whatever was
 * left — which is how a show with 20 guests ended up displaying 5.
 *
 * The clamp is the part worth pinning: the value comes from an admin stepper,
 * but a stored 0 would empty the strip with no explanation and a stored 500
 * would issue 500 per-guest queries.
 */
import { describe, it, expect } from "vitest"
import {
  clampGuestStripLimit,
  GUEST_STRIP_LIMIT_DEFAULT,
  GUEST_STRIP_LIMIT_MIN,
  GUEST_STRIP_LIMIT_MAX,
} from "@/lib/homepage/hall"

describe("clampGuestStripLimit", () => {
  it("keeps a sane value untouched", () => {
    expect(clampGuestStripLimit(6)).toBe(6)
    expect(clampGuestStripLimit(GUEST_STRIP_LIMIT_MAX)).toBe(GUEST_STRIP_LIMIT_MAX)
  })

  it("refuses to empty the strip", () => {
    // A 0 renders nothing and looks exactly like a bug in the section.
    expect(clampGuestStripLimit(0)).toBe(GUEST_STRIP_LIMIT_MIN)
    expect(clampGuestStripLimit(-5)).toBe(GUEST_STRIP_LIMIT_MIN)
  })

  it("caps the ceiling — each face costs a query", () => {
    expect(clampGuestStripLimit(500)).toBe(GUEST_STRIP_LIMIT_MAX)
  })

  it("falls back to the default on anything non-numeric", () => {
    // `Number("")` is 0 and `Number("abc")` is NaN; a stored empty string must
    // not read as "show one guest".
    expect(clampGuestStripLimit(NaN)).toBe(GUEST_STRIP_LIMIT_DEFAULT)
    expect(clampGuestStripLimit(Infinity)).toBe(GUEST_STRIP_LIMIT_DEFAULT)
  })

  it("floors a fraction rather than rounding up past the cap", () => {
    expect(clampGuestStripLimit(6.9)).toBe(6)
  })
})

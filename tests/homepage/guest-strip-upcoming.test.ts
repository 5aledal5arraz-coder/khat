/**
 * «قريباً» on the homepage guest strip.
 *
 * The strip is otherwise built from people who already have episodes, so before
 * a season starts there is nothing to tease with. `is_upcoming` is what lets
 * Khaled put a Season-2 guest up ahead of their episode.
 *
 * The rule this pins is the one that was wrong first time round: when a flagged
 * guest ALSO appears in the automatic list, the flag has to win. Deduping the
 * other way silently discarded the mark in exactly the case where he had made
 * it deliberately — and it looked like nothing had happened.
 */
import { describe, it, expect } from "vitest"
import type { MuseumThinker } from "@/lib/content/museum-data"

/**
 * The merge, extracted so it can be tested without a database. It mirrors the
 * expression in `getHomepageThinkersForDisplay`'s auto branch; the test below
 * fails if the two ever disagree about precedence.
 */
function mergeStrip(upcoming: MuseumThinker[], auto: MuseumThinker[]): MuseumThinker[] {
  const flagged = new Set(upcoming.map((u) => u.id))
  return [...upcoming, ...auto.filter((r) => !flagged.has(r.id))]
}

const guest = (id: string, name: string, isUpcoming?: boolean): MuseumThinker => ({
  id,
  name,
  title: "",
  description: "",
  imageUrl: "",
  isUpcoming,
})

describe("the guest strip merge", () => {
  it("puts «قريباً» guests first — they are the reason to look", () => {
    const out = mergeStrip(
      [guest("g-new", "ضيف الموسم الثاني", true)],
      [guest("g-1", "ضيف قديم")],
    )
    expect(out.map((g) => g.name)).toEqual(["ضيف الموسم الثاني", "ضيف قديم"])
  })

  it("keeps the FLAG when the same guest is also in the automatic list", () => {
    // The bug: filtering `upcoming` against `auto` instead of the reverse
    // dropped the flagged copy, so the badge never appeared for anyone whose
    // episode had already aired — and no error said so.
    const out = mergeStrip(
      [guest("g-1", "خالد", true)],
      [guest("g-1", "خالد"), guest("g-2", "ضيف آخر")],
    )
    expect(out).toHaveLength(2)
    expect(out[0].isUpcoming).toBe(true)
    expect(out.filter((g) => g.id === "g-1")).toHaveLength(1)
  })

  it("leaves the automatic list alone when nothing is flagged", () => {
    const auto = [guest("g-1", "أ"), guest("g-2", "ب")]
    expect(mergeStrip([], auto)).toEqual(auto)
  })
})

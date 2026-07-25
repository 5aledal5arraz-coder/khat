/**
 * `/admin/ops` attention queue — dedupe contract.
 *
 * The bug this file exists to prevent: the home page rendered «ما الذي يحتاج
 * انتباهك الآن؟» and «حلقات متوقفة» as two independent lists over the same
 * table, so an episode that was both recently-active AND stalled was drawn
 * twice on one screen, with two different buttons pointing at the same work.
 *
 * The Wave-1 acceptance criterion is a property, so it is tested as one: no
 * `eir.id` may ever appear more than once in the output.
 */

import { describe, expect, it } from "vitest"
import { buildAttentionQueue, ATTENTION_QUEUE_LIMIT } from "@/lib/khat-brain/attention"
import type { StaleEir } from "@/lib/khat-brain/staleness"
import type { EpisodePhase } from "@/lib/db/schema/eir"

interface Eir {
  id: string
  working_title: string
  phase: EpisodePhase
  updated_at: string
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()

const eir = (id: string, phase: EpisodePhase = "producing", ageH = 1): Eir => ({
  id,
  working_title: `حلقة ${id}`,
  phase,
  updated_at: hoursAgo(ageH),
})

const stale = (e: Eir, ageHours = 51.7): StaleEir => ({
  id: e.id,
  working_title: e.working_title,
  phase: e.phase,
  updated_at: e.updated_at,
  age_hours: ageHours,
  recommended_action: "متابعة إنتاج الحلقة",
  recommended_href: `/admin/khat-brain/episodes/${e.id}?tab=studio`,
  recommended_tone: "normal",
})

/** Every id in the output, for duplicate detection. */
const ids = (q: Array<{ eir: { id: string } }>) => q.map((i) => i.eir.id)

// ─── The regression ──────────────────────────────────────────────────

describe("no episode appears twice", () => {
  /**
   * The exact reproduction from the local DB: EIR f4d7ed56 sat in `producing`,
   * was in the top-10 recently-active list AND was 51.7h idle, so it rendered
   * once in the attention list and again in the stale section.
   */
  it("an episode in BOTH sources yields exactly ONE card", () => {
    const dup = eir("f4d7ed56", "producing", 51.7)
    const other = eir("bbe79f1d", "producing", 1)

    const q = buildAttentionQueue({ recent: [other, dup], stale: [stale(dup)] })

    expect(ids(q)).toHaveLength(2)
    expect(ids(q).filter((id) => id === "f4d7ed56")).toHaveLength(1)
    expect(new Set(ids(q)).size).toBe(q.length)
  })

  it("the duplicated episode keeps its stall as a BADGE, not a second card", () => {
    const dup = eir("f4d7ed56")
    const q = buildAttentionQueue({ recent: [dup], stale: [stale(dup, 51.7)] })

    expect(q).toHaveLength(1)
    expect(q[0].stalled).toEqual({ ageHours: 51.7 })
    // And it still carries its normal next action — the card is not replaced.
    expect(q[0].action.key).toBe("producing.continue")
    expect(q[0].href).toContain("f4d7ed56")
  })

  it("the count the header renders equals the number of cards", () => {
    const a = eir("a")
    const b = eir("b")
    const q = buildAttentionQueue({ recent: [a, b], stale: [stale(a)] })
    // The header prints `queue.length`; with the old two-section layout the
    // screen showed 3 cards for 2 episodes.
    expect(q.length).toBe(2)
    expect(new Set(ids(q)).size).toBe(q.length)
  })

  it("duplicate ids WITHIN a single source are also collapsed", () => {
    const a = eir("a")
    const q = buildAttentionQueue({ recent: [a, { ...a }], stale: [] })
    expect(q).toHaveLength(1)
  })
})

// ─── Nothing is lost by deleting the stale section ───────────────────

describe("removing the separate section loses no information", () => {
  it("a stale episode missing from `recent` is still surfaced", () => {
    // `recent` is the top-10 by recency; `stale` is ordered oldest-first, so
    // the two genuinely diverge. Dropping the difference would have made the
    // deletion a regression.
    const orphan = eir("orphan", "prepared", 300)
    const q = buildAttentionQueue({ recent: [eir("fresh")], stale: [stale(orphan, 300)] })

    expect(ids(q)).toContain("orphan")
    expect(q.find((i) => i.eir.id === "orphan")?.stalled).toEqual({ ageHours: 300 })
  })

  it("a stale-only episode gets a real action, not a placeholder", () => {
    const orphan = eir("orphan", "ready_to_publish", 300)
    const q = buildAttentionQueue({ recent: [], stale: [stale(orphan)] })
    expect(q[0].action.key).toBe("ready_to_publish.push")
    expect(q[0].href).toBe("/admin/khat-brain/episodes/orphan?tab=publish")
  })

  it("stalled episodes are never truncated away by the limit", () => {
    // 10 fresh `recording` episodes (priority 5 — they sort to the top) plus
    // one stalled `analyzing` episode (priority 40 — dead last). A plain
    // slice(0, 8) would drop the stall entirely.
    const recent = Array.from({ length: 10 }, (_, i) => eir(`r${i}`, "recording", 1))
    const forgotten = eir("forgotten", "analyzing", 700)

    const q = buildAttentionQueue({
      recent,
      stale: [stale(forgotten, 700)],
      limit: ATTENTION_QUEUE_LIMIT,
    })

    expect(ids(q)).toContain("forgotten")
    // The cap still applies to the calm items.
    expect(q.filter((i) => i.stalled === null)).toHaveLength(ATTENTION_QUEUE_LIMIT - 1)
    expect(new Set(ids(q)).size).toBe(q.length)
  })
})

// ─── Ordering ────────────────────────────────────────────────────────

describe("ordering", () => {
  it("phase urgency still wins", () => {
    const q = buildAttentionQueue({
      recent: [eir("calm", "idea"), eir("urgent", "recording")],
      stale: [],
    })
    // recording (priority 5) outranks idea (priority 30).
    expect(ids(q)[0]).toBe("urgent")
  })

  it("between equals, the stalled one comes first", () => {
    const stalledOne = eir("stalled", "producing", 60)
    const freshOne = eir("fresh", "producing", 1)
    const q = buildAttentionQueue({
      recent: [freshOne, stalledOne],
      stale: [stale(stalledOne, 60)],
    })
    expect(ids(q)[0]).toBe("stalled")
  })

  it("among stalled episodes the most neglected is on top", () => {
    const older = eir("older", "producing", 200)
    const newer = eir("newer", "producing", 60)
    const q = buildAttentionQueue({
      recent: [],
      stale: [stale(newer, 60), stale(older, 200)],
    })
    expect(ids(q)).toEqual(["older", "newer"])
  })

  it("among calm episodes the freshest is on top", () => {
    const q = buildAttentionQueue({
      recent: [eir("old", "producing", 10), eir("new", "producing", 1)],
      stale: [],
    })
    expect(ids(q)).toEqual(["new", "old"])
  })
})

// ─── Edges ───────────────────────────────────────────────────────────

describe("edges", () => {
  it("both sources empty → empty queue", () => {
    expect(buildAttentionQueue({ recent: [], stale: [] })).toEqual([])
  })

  it("no stale rows → every item is unstalled", () => {
    const q = buildAttentionQueue({ recent: [eir("a"), eir("b")], stale: [] })
    expect(q.every((i) => i.stalled === null)).toBe(true)
  })
})

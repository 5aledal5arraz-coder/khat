/**
 * Pre-shoot checklist flow — the rules that decide whether a take may start.
 *
 * This gate can stop a shoot, so its logic gets tested harder than the UI around
 * it. The two failure directions are both expensive: unlocking early lets an
 * unusable take get shot (flat batteries, unformatted card, mismatched white
 * balance across five bodies), and refusing to unlock when the crew is ready
 * strands them with a guest in the chair.
 *
 * Pure: no DB, no React.
 */

import { describe, expect, it } from "vitest"
import {
  CHECKLIST_GROUPS,
  CHECKLIST_GROUP_KEYS,
  CHECKLIST_ITEMS,
  CHECKLIST_TOTAL,
  deriveChecklistModel,
  deriveHostGateState,
  isChecklistItemKey,
  isRecordingUnlocked,
  itemStateFor,
  NOT_APPLICABLE_REASONS,
  OVERRIDE_REASONS,
  type ChecklistEntry,
} from "@/lib/recording-v2/preflight-checklist"

const AT = "2026-08-02T16:40:00.000Z"

function checked(key: string, at = AT, by = "admin-1"): ChecklistEntry {
  return { item_key: key, checked_at: at, checked_by: by, not_applicable_reason: null }
}
function waived(key: string, reason = "غير متوفّر اليوم"): ChecklistEntry {
  return { item_key: key, checked_at: null, checked_by: "admin-1", not_applicable_reason: reason }
}
function allKeys(): string[] {
  return CHECKLIST_ITEMS.map((i) => i.key)
}
function allChecked(): ChecklistEntry[] {
  return allKeys().map((k) => checked(k))
}

describe("catalogue", () => {
  it("has 17 items in 6 groups", () => {
    expect(CHECKLIST_TOTAL).toBe(17)
    expect(CHECKLIST_GROUPS).toHaveLength(6)
    expect(CHECKLIST_GROUP_KEYS).toHaveLength(6)
  })

  it("has unique item keys", () => {
    expect(new Set(allKeys()).size).toBe(CHECKLIST_TOTAL)
  })

  it("assigns every item to a declared group", () => {
    for (const item of CHECKLIST_ITEMS) {
      expect(CHECKLIST_GROUP_KEYS).toContain(item.group)
    }
  })

  it("covers the exact group sizes Sara specified", () => {
    const sizes = CHECKLIST_GROUPS.map(
      (g) => CHECKLIST_ITEMS.filter((i) => i.group === g.key).length,
    )
    expect(sizes).toEqual([3, 3, 5, 1, 2, 3])
  })

  it("puts the shared five-point reminder under the camera group only", () => {
    const cameras = CHECKLIST_GROUPS.find((g) => g.key === "cameras")!
    expect(cameras.footnote).toContain("الفلتر")
    expect(cameras.footnote).toContain("الكادر")
    expect(CHECKLIST_GROUPS.filter((g) => g.footnote).length).toBe(1)
  })

  it("explains that «الفلتر» means Black Mist wherever it is mentioned", () => {
    // A new operator must never have to guess which filter.
    const withTooltip = CHECKLIST_ITEMS.filter((i) => i.tooltip?.includes("Black Mist"))
    expect(withTooltip.length).toBe(6) // 5 cameras + white balance
  })

  it("gives the white-balance item its own filter-matching hint", () => {
    const wb = CHECKLIST_ITEMS.find((i) => i.key === "match.white_balance")!
    expect(wb.hint).toBe("تأكّد إن الفلتر نفسه على كل الكاميرات")
  })

  it("recognises only catalogue keys", () => {
    expect(isChecklistItemKey("cam.wide")).toBe(true)
    expect(isChecklistItemKey("cam.does_not_exist")).toBe(false)
  })

  it("offers a short list of waiver reasons and override reasons", () => {
    expect(NOT_APPLICABLE_REASONS.length).toBeGreaterThanOrEqual(2)
    expect(NOT_APPLICABLE_REASONS.length).toBeLessThanOrEqual(4)
    expect(OVERRIDE_REASONS).toHaveLength(3)
  })
})

describe("itemStateFor", () => {
  it("treats a missing row as pending", () => {
    expect(itemStateFor(undefined)).toBe("pending")
  })

  it("treats a row with no checked_at and no reason as pending", () => {
    expect(itemStateFor({ item_key: "x", checked_at: null, checked_by: null, not_applicable_reason: null })).toBe("pending")
  })

  it("treats a checked row as done", () => {
    expect(itemStateFor(checked("cam.wide"))).toBe("done")
  })

  it("treats a waived row as not_applicable", () => {
    expect(itemStateFor(waived("cam.wide"))).toBe("not_applicable")
  })

  it("prefers the waiver when both are somehow set", () => {
    expect(
      itemStateFor({ item_key: "x", checked_at: AT, checked_by: "a", not_applicable_reason: "معطّل" }),
    ).toBe("not_applicable")
  })
})

describe("progress counting", () => {
  it("starts at 0 of 17", () => {
    const m = deriveChecklistModel([])
    expect(m.resolvedCount).toBe(0)
    expect(m.total).toBe(17)
    expect(m.isComplete).toBe(false)
  })

  it("counts a waived item as RESOLVED", () => {
    // The gate asks "has every item been dealt with", not "is every item
    // satisfied". A waiver is an attributed decision; pending is not.
    const m = deriveChecklistModel([waived("cam.guest_bts")])
    expect(m.resolvedCount).toBe(1)
  })

  it("reaches 17 of 17 when every item is checked", () => {
    const m = deriveChecklistModel(allChecked())
    expect(m.resolvedCount).toBe(17)
    expect(m.isComplete).toBe(true)
  })

  it("is complete with a mix of checked and waived", () => {
    const entries = allKeys().map((k, i) => (i % 4 === 0 ? waived(k) : checked(k)))
    expect(deriveChecklistModel(entries).isComplete).toBe(true)
  })

  it("is NOT complete when one item is left pending", () => {
    const entries = allChecked().slice(0, 16)
    const m = deriveChecklistModel(entries)
    expect(m.resolvedCount).toBe(16)
    expect(m.isComplete).toBe(false)
  })

  it("ignores rows for keys that are no longer in the catalogue", () => {
    // A removed item must not be able to satisfy the gate.
    const m = deriveChecklistModel([...allChecked(), checked("cam.retired_body")])
    expect(m.resolvedCount).toBe(17)
    expect(m.total).toBe(17)
  })

  it("cannot be completed by 17 copies of stale keys", () => {
    const bogus = Array.from({ length: 17 }, (_, i) => checked(`ghost.${i}`))
    expect(deriveChecklistModel(bogus).isComplete).toBe(false)
  })
})

describe("progressive group disclosure", () => {
  it("opens the first group and dims the rest when nothing is done", () => {
    const g = deriveChecklistModel([]).groups
    expect(g[0].state).toBe("current")
    expect(g.slice(1).every((x) => x.state === "upcoming")).toBe(true)
  })

  it("collapses a finished group and advances to the next", () => {
    const mediaKeys = CHECKLIST_ITEMS.filter((i) => i.group === "media_power").map((i) => i.key)
    const g = deriveChecklistModel(mediaKeys.map((k) => checked(k))).groups
    expect(g[0].state).toBe("done")
    expect(g[1].state).toBe("current")
    expect(g[2].state).toBe("upcoming")
  })

  it("marks a group done when its items are waived rather than checked", () => {
    const mediaKeys = CHECKLIST_ITEMS.filter((i) => i.group === "media_power").map((i) => i.key)
    const g = deriveChecklistModel(mediaKeys.map((k) => waived(k))).groups
    expect(g[0].state).toBe("done")
  })

  it("treats a later completed group as done even when an earlier one is not", () => {
    // The director works the studio out of order constantly; a finished group is
    // finished regardless of position.
    const soundKeys = CHECKLIST_ITEMS.filter((i) => i.group === "sound").map((i) => i.key)
    const g = deriveChecklistModel(soundKeys.map((k) => checked(k))).groups
    expect(g.find((x) => x.key === "sound")!.state).toBe("done")
    expect(g.find((x) => x.key === "media_power")!.state).toBe("current")
  })

  it("marks every group done when the checklist is complete", () => {
    const g = deriveChecklistModel(allChecked()).groups
    expect(g.every((x) => x.state === "done")).toBe(true)
  })

  it("reports per-group counts for the «٣ من ٥» readout", () => {
    const g = deriveChecklistModel([checked("cam.guest_main"), checked("cam.wide")]).groups
    const cams = g.find((x) => x.key === "cameras")!
    expect(cams.resolvedCount).toBe(2)
    expect(cams.total).toBe(5)
  })

  it("keeps every item visible in its group regardless of state", () => {
    // Visibility is not permission — the director must see what is coming.
    const g = deriveChecklistModel([]).groups
    expect(g.reduce((n, x) => n + x.items.length, 0)).toBe(17)
  })
})

describe("blocking group — what the host's bar names", () => {
  it("names the first group holding an unresolved item", () => {
    const m = deriveChecklistModel([])
    expect(m.blockingGroupKey).toBe("media_power")
    expect(m.blockingGroupLabel).toBe("الميديا والطاقة")
  })

  it("advances as groups finish", () => {
    const done = CHECKLIST_ITEMS.filter((i) => i.group === "media_power" || i.group === "light_set")
    const m = deriveChecklistModel(done.map((i) => checked(i.key)))
    expect(m.blockingGroupLabel).toBe("الكاميرات")
  })

  it("is null once complete", () => {
    const m = deriveChecklistModel(allChecked())
    expect(m.blockingGroupKey).toBeNull()
    expect(m.blockingGroupLabel).toBeNull()
  })
})

describe("last-updated attribution — so the host can shout, not walk over", () => {
  it("is null with no confirmations", () => {
    const m = deriveChecklistModel([])
    expect(m.lastUpdatedAt).toBeNull()
    expect(m.lastUpdatedBy).toBeNull()
  })

  it("reports the most recent confirmation and who made it", () => {
    const m = deriveChecklistModel([
      checked("power.batteries", "2026-08-02T16:30:00.000Z", "admin-early"),
      checked("cam.wide", "2026-08-02T16:55:00.000Z", "admin-late"),
      checked("set.decor", "2026-08-02T16:40:00.000Z", "admin-mid"),
    ])
    expect(m.lastUpdatedAt).toBe("2026-08-02T16:55:00.000Z")
    expect(m.lastUpdatedBy).toBe("admin-late")
  })

  it("accepts Date objects as well as ISO strings", () => {
    const m = deriveChecklistModel([
      { item_key: "cam.host", checked_at: new Date(AT), checked_by: "a", not_applicable_reason: null },
    ])
    expect(m.lastUpdatedAt).toBe(AT)
  })
})

describe("the host gate", () => {
  const incomplete = deriveChecklistModel([checked("power.batteries")])
  const complete = deriveChecklistModel(allChecked())

  it("unlocks ONLY when all 17 are resolved", () => {
    expect(deriveHostGateState({ model: complete, directorOnline: true, connected: true })).toBe("ready")
    expect(isRecordingUnlocked("ready")).toBe(true)
  })

  it("blocks while the director is online and still working", () => {
    const s = deriveHostGateState({ model: incomplete, directorOnline: true, connected: true })
    expect(s).toBe("blocked")
    expect(isRecordingUnlocked(s)).toBe(false)
  })

  it("does not unlock at 16 of 17", () => {
    const almost = deriveChecklistModel(allChecked().slice(0, 16))
    expect(deriveHostGateState({ model: almost, directorOnline: true, connected: true })).toBe("blocked")
  })

  it("offers the escape hatches when NO director is connected", () => {
    // A hard gate whose only key is held by someone not in the room would stop
    // the shoot dead. This state is what makes the gate safe to enforce.
    const s = deriveHostGateState({ model: incomplete, directorOnline: false, connected: true })
    expect(s).toBe("no_director")
    expect(isRecordingUnlocked(s)).toBe(false)
  })

  it("reports offline when the host's own connection is down", () => {
    // We cannot claim the checklist is incomplete when we cannot see it.
    const s = deriveHostGateState({ model: incomplete, directorOnline: false, connected: false })
    expect(s).toBe("offline")
    expect(isRecordingUnlocked(s)).toBe(false)
  })

  it("treats offline as offline even if the local copy looks complete", () => {
    // The stale local copy may predate a director un-checking an item.
    expect(deriveHostGateState({ model: complete, directorOnline: true, connected: false })).toBe("offline")
  })

  it("re-locks when the director un-checks an item after completing", () => {
    // A director who spots a problem after confirming must be able to stop the
    // shoot; without this the gate is one-way and useless after the fact.
    const afterUncheck = deriveChecklistModel(allChecked().filter((e) => e.item_key !== "cam.wide"))
    const s = deriveHostGateState({ model: afterUncheck, directorOnline: true, connected: true })
    expect(s).toBe("blocked")
    expect(afterUncheck.blockingGroupLabel).toBe("الكاميرات")
  })

  it("never unlocks from any non-ready state", () => {
    for (const s of ["blocked", "no_director", "offline"] as const) {
      expect(isRecordingUnlocked(s)).toBe(false)
    }
  })
})

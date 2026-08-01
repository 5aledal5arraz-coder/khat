/**
 * Wave 2 §1 — the episode-workspace tab phase gate.
 *
 * Yousef's audit: the gate is the ONLY phase-level protection on the
 * workspace (the role check is sound and the phase state machine is guarded
 * by an independent trigger), and it leaked in two places at once:
 *
 *   1. `computeTabStates` tested `key === selected` BEFORE the phase
 *      threshold, so whichever tab the URL asked for was relabelled
 *      "current" — the greying-out was skipped for exactly the tab an
 *      operator could aim at.
 *   2. The page took `?tab=` with no clamp at all, and the tab body is
 *      switched on the resolved key alone. So even with (1) fixed,
 *      `?tab=publish` on an `idea` EIR still rendered the whole publish
 *      editor, merely greyed out in the nav above it.
 *
 * Both are asserted here, plus the invariant that makes the fallback safe:
 * `defaultTabForPhase` must itself return a reached tab for every phase.
 * That invariant was ALREADY violated (`guest_assigned` → `preparation`,
 * which is gated at `approved`) — harmless while the gate was cosmetic, a
 * self-contradicting screen once it is enforced.
 */

import { describe, it, expect } from "vitest"
import {
  TABS,
  TAB_KEYS,
  computeTabStates,
  defaultTabForPhase,
  isTabReached,
  resolveSelectedTab,
  type TabKey,
} from "@/app/admin/khat-brain/episodes/[eirId]/tabs"
import { EPISODE_PHASES } from "@/lib/db/schema/eir"
import type { EpisodePhase } from "@/lib/db/schema/eir"

/** Driven off the schema constant, not a copy — a new phase shows up here. */
const ALL_PHASES = EPISODE_PHASES as readonly EpisodePhase[]

describe("defaultTabForPhase — the fallback must always be reachable", () => {
  it.each(ALL_PHASES)(
    "phase %s defaults to a tab that phase has actually reached",
    (phase) => {
      const fallback = defaultTabForPhase(phase)
      expect(
        isTabReached(phase, fallback),
        `default tab "${fallback}" for phase "${phase}" is gated at "${TABS[fallback].available_from}"`,
      ).toBe(true)
    },
  )

  it("guest_assigned lands on the guest tab, not the gated preparation tab", () => {
    // The specific violation that existed before this wave.
    expect(defaultTabForPhase("guest_assigned")).toBe("guest")
    expect(isTabReached("guest_assigned", "preparation")).toBe(false)
  })
})

describe("computeTabStates — the phase threshold wins over the selection", () => {
  it("does NOT mark an unreached tab as current just because it is selected", () => {
    const states = computeTabStates("idea", "publish")
    expect(states.publish).toBe("unavailable")
  })

  it.each<[EpisodePhase, TabKey]>([
    ["idea", "publish"],
    ["idea", "performance"],
    ["idea", "recording"],
    ["guest_discovery", "studio"],
    ["approved", "transcript"],
    ["recorded", "performance"],
  ])(
    "phase %s cannot make %s current by selecting it",
    (phase, key) => {
      expect(computeTabStates(phase, key)[key]).toBe("unavailable")
    },
  )

  it("still marks a REACHED selected tab as current", () => {
    expect(computeTabStates("published", "publish").publish).toBe("current")
    expect(computeTabStates("idea", "topic").topic).toBe("current")
  })

  it("labels every tab consistently with isTabReached at every phase", () => {
    // The nav's greying-out and the body's gate must never disagree — they
    // are the two halves of the same rule.
    for (const phase of ALL_PHASES) {
      const selected = defaultTabForPhase(phase)
      const states = computeTabStates(phase, selected)
      for (const key of TAB_KEYS) {
        const reached = isTabReached(phase, key)
        expect(
          states[key] === "unavailable",
          `${phase}/${key}: state=${states[key]} reached=${reached}`,
        ).toBe(!reached)
      }
    }
  })
})

describe("resolveSelectedTab — the ?tab= clamp", () => {
  it("rejects a deep link to an unreached tab and falls back to the default", () => {
    // Yousef's case verbatim: the publish editor on an idea-phase EIR.
    expect(resolveSelectedTab("idea", "publish")).toBe(
      defaultTabForPhase("idea"),
    )
    expect(resolveSelectedTab("idea", "publish")).not.toBe("publish")
  })

  it.each<[EpisodePhase, string]>([
    ["idea", "publish"],
    ["idea", "performance"],
    ["idea", "studio"],
    ["guest_discovery", "recording"],
    ["approved", "clips"],
    ["prepared", "publish"],
    ["recorded", "performance"],
  ])("phase %s never resolves to unreached tab %s", (phase, tab) => {
    expect(resolveSelectedTab(phase, tab)).not.toBe(tab)
  })

  it("honours a deep link to a tab the phase HAS reached", () => {
    expect(resolveSelectedTab("published", "publish")).toBe("publish")
    expect(resolveSelectedTab("recorded", "studio")).toBe("studio")
    expect(resolveSelectedTab("idea", "overview")).toBe("overview")
  })

  it("falls back for a missing, non-string, or unknown ?tab value", () => {
    for (const raw of [undefined, null, "", "nope", 42, {}, ["publish"]]) {
      expect(resolveSelectedTab("recorded", raw)).toBe(
        defaultTabForPhase("recorded"),
      )
    }
  })

  it("always returns a tab the phase has reached, for every phase × every tab", () => {
    // The whole-space assertion: there is no (phase, ?tab) pair that yields
    // an unreached tab. This is what a hardcoded case list cannot promise.
    for (const phase of ALL_PHASES) {
      for (const raw of [...TAB_KEYS, "bogus", undefined]) {
        const got = resolveSelectedTab(phase, raw)
        expect(
          isTabReached(phase, got),
          `phase=${phase} ?tab=${String(raw)} → ${got}`,
        ).toBe(true)
      }
    }
  })
})

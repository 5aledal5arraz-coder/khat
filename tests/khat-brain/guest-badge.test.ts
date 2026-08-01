/**
 * Wave 2 §2 — the phase↔guest contradiction (the THIRD kind).
 *
 * Noura's reproduction after the name-contradiction fix: `smoke-ux3b-norec`
 * shows the pill «ضيف معيّن» (`phase=guest_assigned`) and, directly under it in
 * the same row, «بلا ضيف». Each half reads its own column correctly; together
 * they are a row arguing with itself.
 *
 * No backfill (Q7 is Khaled's open decision). The requirement is that the
 * READER reconciles even when the data is incomplete: the badge states the
 * whole situation, or the guest line stays silent — never both at once.
 *
 * These assert the actual Arabic strings, not their shape, because the shape
 * was never the thing that broke.
 */

import { describe, it, expect } from "vitest"
import {
  reconcileEpisodeBadges,
  phaseClaimsGuest,
  UNRECORDED_GUEST_SUFFIX,
} from "@/lib/khat-brain/guest-badge"
import { PHASE_LABEL } from "@/lib/khat-brain/phase-labels"
import { EPISODE_PHASES } from "@/lib/db/schema/eir"
import type { EpisodePhase } from "@/lib/db/schema/eir"

const ALL_PHASES = EPISODE_PHASES as readonly EpisodePhase[]

describe("the reproduction — guest_assigned with no guest anywhere", () => {
  it("never emits «ضيف معيّن» and «بلا ضيف» about the same row", () => {
    const b = reconcileEpisodeBadges("guest_assigned", null, null)
    // The pill no longer makes a bare claim it cannot back.
    expect(b.phase.text).toBe(`ضيف معيّن · ${UNRECORDED_GUEST_SUFFIX}`)
    expect(b.phase.text).toContain("بلا ضيف في السجل")
    // …and the guest line is silent, so «بلا ضيف» is not printed beneath it.
    expect(b.guest).toEqual({ kind: "unrecorded" })
    expect(b.phase.tone).toBe("warning")
  })

  it("treats empty and whitespace-only names as no guest at all", () => {
    for (const [name, fallback] of [
      ["", ""],
      ["   ", null],
      [null, "  "],
      [undefined, undefined],
    ] as const) {
      expect(
        reconcileEpisodeBadges("guest_assigned", name, fallback).guest.kind,
      ).toBe("unrecorded")
    }
  })
})

describe("phaseClaimsGuest", () => {
  it("is false before a guest is assigned", () => {
    expect(phaseClaimsGuest("idea")).toBe(false)
    // "searching for a guest" and "no guest yet" agree — nothing to reconcile.
    expect(phaseClaimsGuest("guest_discovery")).toBe(false)
  })

  it("is true from guest_assigned onward, for every later phase", () => {
    const from = ALL_PHASES.indexOf("guest_assigned")
    for (const p of ALL_PHASES.slice(from)) {
      expect(phaseClaimsGuest(p), p).toBe(true)
    }
  })
})

describe("the three non-contradictory states are unchanged", () => {
  it("a linked canonical guest wins and the pill stays plain", () => {
    const b = reconcileEpisodeBadges("recorded", "علي دريساوي", null)
    expect(b.guest).toEqual({ kind: "linked", name: "علي دريساوي" })
    expect(b.phase.text).toBe("مسجّلة")
    expect(b.phase.tone).toBe("muted")
  })

  it("a preparation-only name renders as unlinked, never as linked", () => {
    // It has no id and no profile — anything that renders it must say so.
    const b = reconcileEpisodeBadges("guest_assigned", null, "الأستاذ علي دريساوي")
    expect(b.guest).toEqual({ kind: "unlinked", name: "الأستاذ علي دريساوي" })
    expect(b.phase.text).toBe("ضيف معيّن")
    expect(b.phase.tone).toBe("muted")
  })

  it("a linked guest beats a fallback name — never both", () => {
    const b = reconcileEpisodeBadges("approved", "الاسم القانوني", "اسم من الإعداد")
    expect(b.guest).toEqual({ kind: "linked", name: "الاسم القانوني" })
  })

  it("no guest at a phase that claims none is a plain, non-alarming «بلا ضيف»", () => {
    for (const phase of ["idea", "guest_discovery"] as const) {
      const b = reconcileEpisodeBadges(phase, null, null)
      expect(b.guest).toEqual({ kind: "none" })
      expect(b.phase.text).toBe(PHASE_LABEL[phase])
      expect(b.phase.tone).toBe("muted")
    }
  })

  it("trims the names it renders", () => {
    expect(reconcileEpisodeBadges("approved", "  فهد  ", null).guest).toEqual({
      kind: "linked",
      name: "فهد",
    })
  })
})

describe("the invariant that makes the row self-consistent", () => {
  it("warning tone appears if and only if the guest line is silenced", () => {
    for (const phase of ALL_PHASES) {
      for (const [n, f] of [
        [null, null],
        ["اسم", null],
        [null, "اسم"],
        ["اسم", "آخر"],
      ] as const) {
        const b = reconcileEpisodeBadges(phase, n, f)
        expect(
          b.phase.tone === "warning",
          `${phase} / ${n} / ${f} → tone=${b.phase.tone} kind=${b.guest.kind}`,
        ).toBe(b.guest.kind === "unrecorded")
      }
    }
  })

  it("the pill mentions a missing guest ONLY when the guest line is silent", () => {
    for (const phase of ALL_PHASES) {
      for (const [n, f] of [
        [null, null],
        ["اسم", null],
        [null, "اسم"],
      ] as const) {
        const b = reconcileEpisodeBadges(phase, n, f)
        const pillSaysMissing = b.phase.text.includes(UNRECORDED_GUEST_SUFFIX)
        expect(pillSaysMissing, `${phase} / ${n} / ${f}`).toBe(
          b.guest.kind === "unrecorded",
        )
      }
    }
  })

  it("the pill always starts with the phase's own Arabic label", () => {
    for (const phase of ALL_PHASES) {
      const b = reconcileEpisodeBadges(phase, null, null)
      expect(b.phase.text.startsWith(PHASE_LABEL[phase]), phase).toBe(true)
      // And never leaks the raw English enum key to the operator.
      expect(b.phase.text).not.toContain(phase)
    }
  })
})

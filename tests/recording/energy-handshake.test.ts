/**
 * The energy handshake — the director proposes, the host disposes.
 *
 * Locks the rules that only exist because two people share one number during a
 * live take: the ranking energy never moves on its own, a cue lapses visibly
 * after 90s, the host's own hand always wins, and a channel that is being
 * ignored goes quiet instead of nagging.
 */

import { describe, expect, it } from "vitest"
import {
  ENERGY_SUGGESTION_MUTE_AFTER,
  ENERGY_SUGGESTION_TTL_MS,
  energyHandshake,
  initEnergyHandshake,
  type EnergyHandshakeEvent,
  type EnergyHandshakeState,
} from "@/lib/recording-v2/energy-handshake"

const T0 = 1_000_000

/** Fold a list of events, returning the final state + every decision emitted. */
function run(start: EnergyHandshakeState, events: EnergyHandshakeEvent[]) {
  let state = start
  const decisions: { kind: string; level: number; muted?: boolean }[] = []
  const heroes: string[] = []
  for (const e of events) {
    const r = energyHandshake(state, e)
    state = r.state
    if (r.decision) decisions.push(r.decision)
    if (r.hero) heroes.push(r.hero)
  }
  return { state, decisions, heroes }
}

describe("the two numbers stay separate", () => {
  it("does NOT move the ranking energy when the director moves the shared value", () => {
    const { state } = run(initEnergyHandshake(3), [
      { kind: "displayed", level: 5, now: T0 },
    ])
    expect(state.approved).toBe(3) // the questions have not been re-ranked
    expect(state.pending?.level).toBe(5) // it is a cue, awaiting a decision
  })

  it("moves the ranking energy on approval — and only then", () => {
    const { state, decisions } = run(initEnergyHandshake(3), [
      { kind: "displayed", level: 5, now: T0 },
      { kind: "approve", now: T0 + 1_000 },
    ])
    expect(state.approved).toBe(5)
    expect(state.pending).toBeNull()
    expect(decisions).toEqual([{ kind: "approved", level: 5, muted: false }])
  })

  it("emits NO hero instruction on approval — the displayed question must not move", () => {
    const { heroes } = run(initEnergyHandshake(1), [
      { kind: "displayed", level: 5, now: T0 },
      { kind: "approve", now: T0 + 1_000 },
    ])
    expect(heroes).toEqual([]) // even though the band went low → high
  })

  it("treats the host's own echo as nothing to decide", () => {
    // The host set 5 himself; the SSE round-trip brings 5 back.
    const { state } = run(initEnergyHandshake(3), [
      { kind: "host_set", level: 5, now: T0 },
      { kind: "displayed", level: 5, now: T0 + 200 },
    ])
    expect(state.pending).toBeNull()
    expect(state.approved).toBe(5)
  })
})

describe("the host's tap applies to BOTH numbers, even when they diverge", () => {
  // The bug this locks: the dial's click guard compared against the DISPLAYED
  // energy while the ranking read the APPROVED one. Once a lapsed cue left them
  // apart (displayed 5, ranking 3), tapping the already-lit dot did nothing at
  // all — a dead button in a live cockpit.
  function diverged(): EnergyHandshakeState {
    const { state } = run(initEnergyHandshake(3), [
      { kind: "displayed", level: 5, now: T0 },
      { kind: "expire", now: T0 + ENERGY_SUGGESTION_TTL_MS },
    ])
    return state
  }

  it("adopts the displayed value when the host taps the dot that is already lit", () => {
    const before = diverged()
    expect(before.approved).toBe(3) // ranking still on متوسط while the room shows حادّ
    const { state } = run(before, [{ kind: "host_set", level: 5, now: T0 + 200_000 }])
    expect(state.approved).toBe(5) // the tap was NOT swallowed
  })

  it("re-deals the deck on that tap, because it crossed a grade", () => {
    const { heroes } = run(diverged(), [{ kind: "host_set", level: 5, now: T0 + 200_000 }])
    expect(heroes).toEqual(["reset"])
  })

  it("lifts the mute when the host reaches for the dial himself", () => {
    let s = initEnergyHandshake(3)
    for (let i = 0; i < ENERGY_SUGGESTION_MUTE_AFTER; i++) {
      s = run(s, [
        { kind: "displayed", level: 5 - i, now: T0 + i * 200_000 },
        { kind: "expire", now: T0 + i * 200_000 + ENERGY_SUGGESTION_TTL_MS },
      ]).state
    }
    expect(s.muted).toBe(true)
    const after = run(s, [{ kind: "host_set", level: 1, now: T0 + 900_000 }])
    expect(after.state.muted).toBe(false)
    expect(after.decisions.at(-1)).toEqual({ kind: "unmuted", level: 1, muted: false })
    // …and the channel really is open again.
    const cue = run(after.state, [{ kind: "displayed", level: 5, now: T0 + 950_000 }])
    expect(cue.state.pending?.level).toBe(5)
  })
})

describe("the director learns he is being ignored", () => {
  it("flags the mute on the very lapse that caused it", () => {
    let s = initEnergyHandshake(3)
    const all: { kind: string; level: number; muted?: boolean }[] = []
    for (let i = 0; i < ENERGY_SUGGESTION_MUTE_AFTER; i++) {
      const r = run(s, [
        { kind: "displayed", level: 5 - i, now: T0 + i * 200_000 },
        { kind: "expire", now: T0 + i * 200_000 + ENERGY_SUGGESTION_TTL_MS },
      ])
      s = r.state
      all.push(...r.decisions)
    }
    expect(all[0].muted).toBe(false) // first lapse: still listening
    expect(all[1].muted).toBe(true) // second: the channel closed, and he is told
  })

  it("announces the re-open on a new take", () => {
    const muted: EnergyHandshakeState = { ...initEnergyHandshake(3), muted: true, ignored: 2 }
    const { decisions } = run(muted, [{ kind: "reset", level: 3 }])
    expect(decisions).toEqual([{ kind: "unmuted", level: 3, muted: false }])
  })

  it("stays silent about un-muting when it was never muted", () => {
    const { decisions } = run(initEnergyHandshake(3), [{ kind: "reset", level: 3 }])
    expect(decisions).toEqual([])
  })
})

describe("a cue that cannot change anything never interrupts", () => {
  it("adopts a same-GRADE move silently — no banner, no decision", () => {
    // 4 → 5 is the same grade, so the ranking is identical; a banner reading
    // "المخرج يقترح: حادّ · ترتيبك الآن على حادّ" admits in its own text that it
    // changes nothing.
    const { state, decisions } = run(initEnergyHandshake(4), [
      { kind: "displayed", level: 5, now: T0 },
    ])
    expect(state.pending).toBeNull()
    expect(state.approved).toBe(5)
    expect(decisions).toEqual([])
  })

  it("still raises a cue when the GRADE changes", () => {
    const { state } = run(initEnergyHandshake(4), [{ kind: "displayed", level: 1, now: T0 }])
    expect(state.pending?.level).toBe(1)
    expect(state.approved).toBe(4)
  })
})

describe("the host's own dial", () => {
  it("re-deals the deck when it crosses a band", () => {
    const { heroes } = run(initEnergyHandshake(3), [{ kind: "host_set", level: 1, now: T0 }])
    expect(heroes).toEqual(["reset"])
  })

  it("does NOT re-deal within the same band — 4→5 is the same grade", () => {
    const { heroes } = run(initEnergyHandshake(4), [{ kind: "host_set", level: 5, now: T0 }])
    expect(heroes).toEqual([])
  })

  it("wins instantly over a pending cue, which never comes back", () => {
    const { state, decisions } = run(initEnergyHandshake(3), [
      { kind: "displayed", level: 5, now: T0 },
      { kind: "host_set", level: 1, now: T0 + 2_000 },
      // 90s later the cue would have lapsed — there is nothing left to lapse.
      { kind: "expire", now: T0 + ENERGY_SUGGESTION_TTL_MS },
    ])
    expect(state.approved).toBe(1)
    expect(state.pending).toBeNull()
    expect(decisions).toEqual([{ kind: "overridden", level: 1, muted: false }])
  })
})

describe("a cue that is not answered", () => {
  it("lapses after 90s, visibly, and tells the director", () => {
    const { state, decisions } = run(initEnergyHandshake(3), [
      { kind: "displayed", level: 5, now: T0 },
      { kind: "expire", now: T0 + ENERGY_SUGGESTION_TTL_MS },
    ])
    expect(state.pending).toBeNull()
    expect(state.lapsed).toEqual({ level: 5, at: T0 + ENERGY_SUGGESTION_TTL_MS })
    expect(state.approved).toBe(3) // and the ranking never moved
    expect(decisions).toEqual([{ kind: "expired", level: 5, muted: false }])
  })

  it("goes quiet for the rest of the take after two lapses in a row", () => {
    let s = initEnergyHandshake(3)
    for (let i = 0; i < ENERGY_SUGGESTION_MUTE_AFTER; i++) {
      s = run(s, [
        { kind: "displayed", level: 5 - i, now: T0 + i * 200_000 },
        { kind: "expire", now: T0 + i * 200_000 + ENERGY_SUGGESTION_TTL_MS },
      ]).state
    }
    expect(s.muted).toBe(true)
    const after = run(s, [{ kind: "displayed", level: 0, now: T0 + 900_000 }])
    expect(after.state.pending).toBeNull() // silent, not stacked
  })

  it("un-mutes on a new take", () => {
    const muted: EnergyHandshakeState = { ...initEnergyHandshake(3), muted: true, ignored: 2 }
    const { state } = run(muted, [{ kind: "reset", level: 3 }])
    expect(state.muted).toBe(false)
    expect(state.ignored).toBe(0)
  })
})

describe("one slot, one message", () => {
  it("replaces a pending cue in place instead of stacking", () => {
    const { state } = run(initEnergyHandshake(3), [
      { kind: "displayed", level: 5, now: T0 },
      { kind: "displayed", level: 1, now: T0 + 5_000 },
    ])
    expect(state.pending?.level).toBe(1)
  })

  it("pulses at most once per 90s window", () => {
    const first = run(initEnergyHandshake(3), [{ kind: "displayed", level: 5, now: T0 }])
    expect(first.state.pending?.pulse).toBe(true)
    const second = run(first.state, [{ kind: "displayed", level: 1, now: T0 + 5_000 }])
    expect(second.state.pending?.pulse).toBe(false) // replaced quietly
    const later = run(second.state, [
      { kind: "displayed", level: 4, now: T0 + ENERGY_SUGGESTION_TTL_MS + 1 },
    ])
    expect(later.state.pending?.pulse).toBe(true)
  })

  it("clears a cue the director walks back", () => {
    const { state } = run(initEnergyHandshake(3), [
      { kind: "displayed", level: 5, now: T0 },
      { kind: "displayed", level: 3, now: T0 + 4_000 },
    ])
    expect(state.pending).toBeNull()
    expect(state.approved).toBe(3)
  })
})

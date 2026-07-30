/**
 * The energy handshake: the director PROPOSES, the host DISPOSES.
 *
 * Two numbers, not one — this is the whole point of the module:
 *
 *   • the DISPLAYED energy (`collaboration_rooms.energy_level`) is live, shared
 *     and immediate. The director's tap moves it at once, it drives the ribbon
 *     and it writes an `energy_change` marker. Nothing here touches it.
 *   • the APPROVED energy is what the question ranking reads, and it moves ONLY
 *     by the host's hand — his own dial, or his approval of a cue.
 *
 * They have to be separate. Khaled asked for both "the value reaches me
 * instantly" and "the questions do not change before I approve", and with one
 * number those are contradictory: the director's tap re-sorted the host's list
 * mid-question, silently, while he was reading from it.
 *
 * Pure (no React / no DB / no clock of its own — `now` is always passed in) so
 * the 90s lapse, the two-strikes mute and the two-writers rule are unit-testable
 * without a browser.
 */

import { energyBand } from "./energy"

/** A cue the host does not react to is dropped after this long. */
export const ENERGY_SUGGESTION_TTL_MS = 90_000

/** Two cues lapse in a row → the channel goes quiet for the rest of the take. */
export const ENERGY_SUGGESTION_MUTE_AFTER = 2

/** How long the "your cue lapsed" line stays up before it clears itself. */
export const ENERGY_LAPSE_NOTICE_MS = 8_000

export interface EnergySuggestion {
  level: number
  at: number
  expiresAt: number
  /**
   * Whether this one may grab attention. One pulse per TTL window at most: a
   * newer cue REPLACES the old one in the same slot, it never stacks and it
   * never re-pulses. The message still updates — the host must see the current
   * proposal — but the room only interrupts him once.
   */
  pulse: boolean
}

export interface EnergyHandshakeState {
  /** The energy the ranking reads. */
  approved: number
  /** The director's live cue awaiting a decision, if any. */
  pending: EnergySuggestion | null
  /** A cue that lapsed — kept briefly so the drop is SEEN, never silent. */
  lapsed: { level: number; at: number } | null
  /** Consecutive lapses. Reset by any host reaction. */
  ignored: number
  /** Muted for the rest of the take. */
  muted: boolean
  lastPulseAt: number | null
}

export type EnergyHandshakeEvent =
  /** The shared displayed value is now X (from SSE, whoever wrote it). */
  | { kind: "displayed"; level: number; now: number }
  /** The host turned his OWN dial. */
  | { kind: "host_set"; level: number; now: number }
  /** The host adopted the pending cue. */
  | { kind: "approve"; now: number }
  /** The pending cue's 90s ran out. */
  | { kind: "expire"; now: number }
  /** The lapse notice has been on screen long enough. */
  | { kind: "clear_lapsed" }
  /** A new take — everything, including the mute, starts over. */
  | { kind: "reset"; level: number }

export type EnergyDecisionOut = "approved" | "expired" | "overridden" | "unmuted"

export interface EnergyHandshakeResult {
  state: EnergyHandshakeState
  /**
   * What to tell the director, if anything — and about which level. The level
   * is the one HE cares about: the cue that was adopted, the cue that lapsed,
   * or the value the host set instead of it.
   *
   * `muted` rides along on the decision that CAUSED the silence, because the
   * director has no other way to learn he is being ignored: his status line sat
   * on "معلّق… ينتظر موافقته" for five measured minutes after the channel had
   * gone quiet — a line that asserts something untrue is worse than no line.
   */
  decision?: { kind: EnergyDecisionOut; level: number; muted?: boolean }
  /**
   * `"reset"` = release the on-air hero pin, i.e. re-deal the deck.
   *
   * Emitted for exactly ONE event: the host moving his own dial across a band.
   * That is the fix for "the dial has no effect" — the pin used to be permanent,
   * so one tap on any question froze the displayed question forever.
   *
   * Approval deliberately emits NOTHING here. The hero must not move when a cue
   * is approved (approval changes the "next up" row only, and that row is
   * tappable, so the host chooses when to jump) — and it cannot, because the
   * on-air view keeps the pin on whatever is already on screen. Adding a signal
   * for it would be a second way to say "don't move", which is how these things
   * drift apart.
   */
  hero?: "reset"
}

export function initEnergyHandshake(level: number): EnergyHandshakeState {
  return {
    approved: level,
    pending: null,
    lapsed: null,
    ignored: 0,
    muted: false,
    lastPulseAt: null,
  }
}

export function energyHandshake(
  state: EnergyHandshakeState,
  event: EnergyHandshakeEvent,
): EnergyHandshakeResult {
  switch (event.kind) {
    case "displayed": {
      /**
       * Compared by GRADE, not by raw number.
       *
       * The ranking is a function of the band alone, so 4→5 cannot reorder
       * anything — and interrupting a live host with "المخرج يقترح: هادئ ·
       * ترتيبك الآن على هادئ" is a banner that admits, in its own text, that it
       * changes nothing. Same grade ⇒ adopt it silently and stay quiet; only a
       * grade change is a real proposal.
       */
      if (energyBand(event.level) === energyBand(state.approved)) {
        if (event.level === state.approved && !state.pending) return { state }
        return { state: { ...state, approved: event.level, pending: null } }
      }
      if (state.muted) return { state }
      const pulse =
        state.lastPulseAt == null || event.now - state.lastPulseAt >= ENERGY_SUGGESTION_TTL_MS
      return {
        state: {
          ...state,
          // ONE slot: the newest cue replaces the previous one in place.
          pending: {
            level: event.level,
            at: event.now,
            expiresAt: event.now + ENERGY_SUGGESTION_TTL_MS,
            pulse,
          },
          lapsed: null,
          lastPulseAt: pulse ? event.now : state.lastPulseAt,
        },
      }
    }

    case "host_set": {
      // TWO-WRITERS RULE: the host's own hand wins immediately and cancels any
      // pending cue, which does not come back.
      //
      // It also LIFTS the mute. The silence is a judgement about a host who is
      // not looking; a host reaching for the dial himself is the proof that he
      // is — so keeping the director gagged for the rest of the take after that
      // punishes the wrong person.
      const crossedBand = energyBand(event.level) !== energyBand(state.approved)
      const decision: EnergyHandshakeResult["decision"] = state.pending
        ? { kind: "overridden", level: event.level, muted: false }
        : state.muted
          ? { kind: "unmuted", level: event.level, muted: false }
          : undefined
      return {
        state: {
          ...state,
          approved: event.level,
          pending: null,
          lapsed: null,
          ignored: 0,
          muted: false,
        },
        decision,
        hero: crossedBand ? "reset" : undefined,
      }
    }

    case "approve": {
      if (!state.pending) return { state }
      return {
        state: {
          ...state,
          approved: state.pending.level,
          pending: null,
          lapsed: null,
          ignored: 0,
        },
        decision: { kind: "approved", level: state.pending.level, muted: false },
      }
    }

    case "expire": {
      if (!state.pending) return { state }
      const ignored = state.ignored + 1
      const muted = ignored >= ENERGY_SUGGESTION_MUTE_AFTER
      return {
        state: {
          ...state,
          pending: null,
          lapsed: { level: state.pending.level, at: event.now },
          ignored,
          muted,
        },
        // The mute rides on the lapse that caused it — this is the only event
        // the director can learn it from.
        decision: { kind: "expired", level: state.pending.level, muted },
      }
    }

    case "clear_lapsed":
      return { state: state.lapsed ? { ...state, lapsed: null } : state }

    case "reset":
      return {
        state: initEnergyHandshake(event.level),
        // A new take re-opens the channel. Say so, or the director's screen
        // keeps claiming he is muted into a take where he is not.
        decision: state.muted
          ? { kind: "unmuted", level: event.level, muted: false }
          : undefined,
      }
  }
}

/**
 * Which question is on screen: the pinned one while it is still open, else the
 * top of the current ranking.
 *
 * It lives beside the handshake because it carries the invariant the handshake
 * depends on — a PINNED hero is immune to re-ranking. That is what lets the
 * energy order change (the entire point of the feature) without the question
 * the host is reading moving under him mid-sentence.
 */
export function resolveHero<T extends { id: string }>(
  open: T[],
  pinnedId: string | null,
): T | null {
  return open.find((q) => q.id === pinnedId) ?? open[0] ?? null
}

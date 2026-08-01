/**
 * Reconciles the two things a Khat Brain episode row says about its guest.
 *
 * The bug this exists for: `smoke-ux3b-norec` sits at `guest_assigned`, so the
 * phase pill reads «ضيف معيّن» — and directly underneath, in the same row, the
 * guest line reads «بلا ضيف». Both statements are faithful to their own
 * column. Together they are nonsense, and the operator has no way to tell
 * which one to act on.
 *
 * This is a different defect from the one the display fallback fixed. That one
 * was a NAME contradiction (the list said «بلا ضيف», the detail page named the
 * guest) and it was fixed by reading the preparation's guest name too. This one
 * is a PHASE-vs-GUEST contradiction, and no amount of extra reading fixes it:
 * the record genuinely has no guest anywhere, while its phase asserts one.
 *
 * So the fix is not more data — it is the reader refusing to contradict itself.
 * A phase at or past `guest_assigned` is a claim that a guest was chosen. When
 * the record cannot back that claim up, we do NOT print the claim and its
 * denial side by side; we print one badge that states the whole situation, and
 * the guest line stays silent because the badge already said it.
 *
 * Deliberately NOT a backfill: writing `guest_id` from a preparation name is a
 * data decision that is Khaled's to make (Q7, open). This only changes what the
 * screen says about data it did not touch.
 */

import { EPISODE_PHASES, type EpisodePhase } from "@/lib/db/schema/eir"
import { PHASE_LABEL } from "./phase-labels"

/**
 * Phases whose existence asserts that a guest was chosen. `guest_discovery`
 * is deliberately NOT one of them — "searching for a guest" and "no guest yet"
 * agree with each other, so that row has nothing to reconcile.
 */
const FIRST_GUEST_CLAIMING_PHASE: EpisodePhase = "guest_assigned"

/**
 * Ordering comes from the schema's `EPISODE_PHASES`, never a local copy: a
 * hand-maintained duplicate would keep type-checking after a phase is inserted
 * before `guest_assigned` and would silently stop flagging the contradiction.
 */
export function phaseClaimsGuest(phase: EpisodePhase): boolean {
  const at = EPISODE_PHASES.indexOf(phase)
  const from = EPISODE_PHASES.indexOf(FIRST_GUEST_CLAIMING_PHASE)
  return at >= 0 && at >= from
}

export type GuestBadge =
  /** A canonical `guests` row is linked — the guest line is the full truth. */
  | { kind: "linked"; name: string }
  /**
   * A name exists on the preparation only. Renderable, but it carries no id
   * and no profile, so every render must say so.
   */
  | { kind: "unlinked"; name: string }
  /** No guest, and the phase does not claim one. Nothing is wrong here. */
  | { kind: "none" }
  /**
   * The phase claims a guest the record does not have. The phase pill carries
   * the whole statement; the guest line renders NOTHING, because printing
   * «بلا ضيف» under a pill that says «ضيف معيّن» is the bug.
   */
  | { kind: "unrecorded" }

export interface EpisodeIdentityBadges {
  phase: {
    /** Already-resolved Arabic text for the pill. */
    text: string
    /** `warning` only ever pairs with `guest.kind === "unrecorded"`. */
    tone: "muted" | "warning"
  }
  guest: GuestBadge
}

/** Appended to the phase label when the phase's guest claim is unbacked. */
export const UNRECORDED_GUEST_SUFFIX = "بلا ضيف في السجل"

/**
 * Single decision point for "what does this row say about its guest".
 *
 * Both the pill and the guest line come out of one call, so they cannot
 * disagree — which is the entire point.
 */
export function reconcileEpisodeBadges(
  phase: EpisodePhase,
  guestName: string | null | undefined,
  guestFallbackName: string | null | undefined,
): EpisodeIdentityBadges {
  const label = PHASE_LABEL[phase] ?? phase
  const muted = { text: label, tone: "muted" as const }

  const linked = guestName?.trim()
  if (linked) return { phase: muted, guest: { kind: "linked", name: linked } }

  const fallback = guestFallbackName?.trim()
  if (fallback) {
    return { phase: muted, guest: { kind: "unlinked", name: fallback } }
  }

  if (phaseClaimsGuest(phase)) {
    return {
      phase: { text: `${label} · ${UNRECORDED_GUEST_SUFFIX}`, tone: "warning" },
      guest: { kind: "unrecorded" },
    }
  }

  return { phase: muted, guest: { kind: "none" } }
}

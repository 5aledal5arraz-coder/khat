/**
 * Khat Brain — Episode phase state machine.
 *
 * Forward-only transitions + an `archived` escape from any non-terminal
 * phase. If editorial decides to "go back" (e.g. re-record), the design
 * decision for Phase 1 is to archive the EIR and create a new one
 * downstream of the same season + guest. This keeps the audit clean and
 * prevents ambiguous "what version of the prep is real?" questions.
 *
 * Recovery transitions (e.g. producing → recording) are intentionally
 * NOT in the map. Add them in a later phase if real workflow demands it,
 * with a written justification per transition.
 */

import type { EpisodePhase } from "@/lib/db/schema/eir"
import { EPISODE_PHASES } from "@/lib/db/schema/eir"

/**
 * Linear forward chain. Each phase points to the *normal* next phase.
 * Archive is allowed from any non-terminal phase via `canArchiveFrom`.
 */
const LINEAR_NEXT: Record<EpisodePhase, EpisodePhase | null> = {
  idea: "guest_assigned", // discovery is optional — see ALLOWED below
  guest_discovery: "guest_assigned",
  guest_assigned: "approved",
  approved: "researching",
  researching: "prepared",
  prepared: "ready_to_record",
  ready_to_record: "recording",
  recording: "recorded",
  recorded: "producing",
  producing: "ready_to_publish",
  ready_to_publish: "published",
  published: "analyzing",
  analyzing: "learned",
  learned: "archived",
  archived: null,
}

/**
 * Branches off the linear chain. Each entry is "from this phase, you may
 * also go to these other phases" (in addition to LINEAR_NEXT).
 * Keep this list short and intentional.
 */
const ADDITIONAL_TRANSITIONS: Partial<Record<EpisodePhase, EpisodePhase[]>> = {
  // Idea may skip guest_discovery if a guest is already known.
  idea: ["guest_discovery"],
}

/** Final, frozen transition table. Computed once. */
const ALLOWED: Record<EpisodePhase, ReadonlySet<EpisodePhase>> =
  buildAllowedTable()

function buildAllowedTable(): Record<EpisodePhase, ReadonlySet<EpisodePhase>> {
  const out = {} as Record<EpisodePhase, Set<EpisodePhase>>
  for (const phase of EPISODE_PHASES) {
    out[phase] = new Set<EpisodePhase>()
    const next = LINEAR_NEXT[phase]
    if (next) out[phase].add(next)
    const extras = ADDITIONAL_TRANSITIONS[phase]
    if (extras) for (const p of extras) out[phase].add(p)
    // Archive is allowed from every non-terminal phase except itself.
    if (phase !== "archived") out[phase].add("archived")
  }
  return out as Record<EpisodePhase, ReadonlySet<EpisodePhase>>
}

export class InvalidPhaseTransitionError extends Error {
  readonly from: EpisodePhase
  readonly to: EpisodePhase
  constructor(from: EpisodePhase, to: EpisodePhase) {
    super(
      `Invalid phase transition: ${from} → ${to}. ` +
        `Allowed: ${[...(ALLOWED[from] ?? [])].join(", ") || "(terminal)"}`,
    )
    this.name = "InvalidPhaseTransitionError"
    this.from = from
    this.to = to
  }
}

export function isAllowedTransition(
  from: EpisodePhase,
  to: EpisodePhase,
): boolean {
  return ALLOWED[from]?.has(to) ?? false
}

export function assertAllowedTransition(
  from: EpisodePhase,
  to: EpisodePhase,
): void {
  if (!isAllowedTransition(from, to)) {
    throw new InvalidPhaseTransitionError(from, to)
  }
}

/** Pure read for tooling / docs / UI dropdowns. */
export function allowedNextPhases(from: EpisodePhase): EpisodePhase[] {
  return [...(ALLOWED[from] ?? [])]
}

/**
 * Khat Brain — Episode phase state machine.
 *
 * Forward-only transitions + an `archived` escape from any non-terminal
 * phase, plus ONE deliberate backward edge (`recorded → ready_to_record`,
 * the re-shoot; see ADDITIONAL_TRANSITIONS).
 *
 * The original Phase-1 decision was that going back meant archiving the EIR
 * and creating a new one. Real workflow overruled it: when the crew scraps a
 * take and re-shoots the same guest on the same prep, that is the SAME
 * episode. Cloning the EIR left two records competing for "which prep is
 * real?", which is the exact ambiguity the archive rule was meant to avoid.
 *
 * Other recovery transitions (e.g. producing → recording) remain
 * intentionally absent. Add them only with a written justification per
 * transition, and remember the matrix is duplicated in SQL — see below.
 *
 * ⚠️ This matrix is encoded TWICE. Any edit here MUST be mirrored in the
 * trigger function literal in `scripts/migrate-phase2-1-eir-trigger.ts`,
 * then that migration re-run. `tests/eir/trigger-matrix.test.ts` fails if
 * the two drift.
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
  /**
   * RETAKE — the one backward edge in the machine.
   *
   * The crew scrapped the take and is re-shooting the same episode with the
   * same guest and the same prep. Fired by `resetTimer` when a new take is
   * opened. Without it the EIR stayed `recorded` while the studio was being
   * re-lit, and every producer surface kept reading «مسجّلة».
   *
   * ⚠️ This edge makes the phase graph CYCLIC (ready_to_record → recording →
   * recorded → ready_to_record). Anything that walks phase history must not
   * assume monotonic progress — `eir_phase_transitions` can now legitimately
   * contain the same phase more than once for one EIR.
   */
  recorded: ["ready_to_record"],
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

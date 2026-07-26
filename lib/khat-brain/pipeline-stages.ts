/**
 * The production pipeline, grouped into the FIVE stages an operator thinks in.
 *
 * WHY THIS EXISTS
 * ---------------
 * `EPISODE_PHASES` has 15 members; 13 of them are non-terminal. The admin home
 * used to draw all 13 as a grid of equal cells, each with a bar whose width was
 * `count / peak` — a ratio with no statistical meaning (if every phase held one
 * record, every bar rendered 100% full). It also wrapped onto four rows, which
 * destroyed the one thing a pipeline view exists to show: the ORDER.
 *
 * A phase is an implementation detail of `lib/eir/`. A stage is what a human
 * asks about ("what's stuck in إعداد?"). This module owns the mapping so the
 * home funnel and the episodes index filter cannot drift apart — the funnel
 * tile links to `?stage=<key>`, and the index resolves that key through this
 * same table.
 *
 * TWO PROPERTIES THIS FILE GUARANTEES (one by the type system, one by test):
 *   • COVERAGE — every non-terminal phase belongs to some stage. Enforced at
 *     compile time by `_STAGES_COVER_EVERY_NON_TERMINAL_PHASE` below; a new
 *     phase in `EPISODE_PHASES` is a type error until it is placed here.
 *   • DISJOINTNESS — no phase appears in two stages. Asserted in
 *     `tests/ops/pipeline-funnel.test.ts`, together with the invariant the
 *     funnel actually renders: Σ stage counts === the headline number.
 *
 * ON THE FIFTH STAGE'S NAME. `analyzing` and `learned` come AFTER `published`
 * in the lifecycle (published → analyzing → learned → archived), yet they are
 * non-terminal, so the coverage rule above puts them in a stage. Labelling the
 * bucket that holds them «جاهزة للنشر» would be false for two of its three
 * phases, so it is named for what it actually contains.
 */

import { EPISODE_PHASES, type EpisodePhase } from "@/lib/db/schema/eir"

/**
 * Phases that have LEFT the pipeline. Single source — `app/admin/ops/page.tsx`
 * imports this rather than redeclaring it, which is how the headline count and
 * this grouping stay defined against the same scope.
 */
export const TERMINAL_PHASES: ReadonlySet<EpisodePhase> = new Set<EpisodePhase>([
  "published",
  "archived",
])

export type NonTerminalPhase = Exclude<EpisodePhase, "published" | "archived">

export interface PipelineStage {
  key: string
  /** Arabic label rendered on the funnel tile. */
  label: string
  /** The phases this stage rolls up, in lifecycle order. */
  phases: readonly NonTerminalPhase[]
}

export const PIPELINE_STAGES = [
  {
    key: "idea_guest",
    label: "فكرة وضيف",
    phases: ["idea", "guest_discovery", "guest_assigned", "approved"],
  },
  {
    key: "preparation",
    label: "إعداد",
    phases: ["researching", "prepared"],
  },
  {
    key: "recording",
    label: "تسجيل",
    phases: ["ready_to_record", "recording", "recorded"],
  },
  {
    key: "production",
    label: "إنتاج",
    phases: ["producing"],
  },
  {
    key: "publishing",
    label: "النشر وما بعده",
    phases: ["ready_to_publish", "analyzing", "learned"],
  },
] as const satisfies readonly PipelineStage[]

export type PipelineStageKey = (typeof PIPELINE_STAGES)[number]["key"]

/** Every phase named anywhere in `PIPELINE_STAGES`. */
type MappedPhase = (typeof PIPELINE_STAGES)[number]["phases"][number]

/**
 * Compile-time coverage guard. If a phase is added to `EPISODE_PHASES` and not
 * placed in a stage above, `Exclude<…>` stops being `never` and this line fails
 * to type-check — which is the whole point: a silently unmapped phase would
 * vanish from the funnel while still being counted in the headline above it.
 */
type UncoveredPhase = Exclude<NonTerminalPhase, MappedPhase>
const _STAGES_COVER_EVERY_NON_TERMINAL_PHASE: UncoveredPhase extends never
  ? true
  : never = true
void _STAGES_COVER_EVERY_NON_TERMINAL_PHASE

/** Non-terminal phases in lifecycle order — the scope the funnel partitions. */
export const NON_TERMINAL_PHASES: readonly NonTerminalPhase[] = EPISODE_PHASES.filter(
  (p): p is NonTerminalPhase => !TERMINAL_PHASES.has(p),
)

/**
 * `?stage=<key>` → the phases it means, or `null` for anything unrecognised.
 * Unrecognised MUST fall back to "no filter", never to an empty phase list:
 * a typo'd key that filtered to zero rows would render as "no episodes here"
 * — a lie the operator has no way to detect.
 */
export function resolveStage(
  key: string | null | undefined,
): (typeof PIPELINE_STAGES)[number] | null {
  if (!key) return null
  return PIPELINE_STAGES.find((s) => s.key === key) ?? null
}

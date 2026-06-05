/**
 * Khat Brain Phase 5 — archetype seeding.
 *
 * Generates a list of "human pattern" archetypes the search agents will
 * use as queries. The discovery system intentionally does NOT start
 * with names or follower counts — it starts with the kinds of stories
 * Khat tries to surface (transformation, hidden expertise, conflict
 * with low visibility, honest speech about loss / money / identity /
 * success / family / failure).
 *
 * Uses task_kind=discovery; the AI Router routes this to gpt-4o.
 */

import { runAiTask } from "@/lib/ai-router"
import { buildDiscoveryArchetypesPrompt } from "@/lib/ai/prompts/discovery-archetypes"
import type { DiscoveryArchetype, DiscoveryRunStatus } from "@/lib/db/schema/discovery"

export interface SeedArchetypesInput {
  /** Free-form admin prompt for the run (Arabic ok). */
  seedPrompt?: string | null
  /**
   * Optional editorial context — Khat DNA / past identity statements.
   * Empty string is fine; the seeder will fall back to its baseline
   * editorial brief if no context is supplied.
   */
  editorialContext?: string
  /** Default 8 archetypes — enough variety, not a flood. */
  count?: number
  /** Optional EIR / subject for telemetry; not required. */
  subjectId?: string | null
}

export interface SeedArchetypesResult {
  archetypes: DiscoveryArchetype[]
  runId: string | null
  ok: boolean
  errorMessage: string | null
}

export async function seedArchetypes(
  input: SeedArchetypesInput,
): Promise<SeedArchetypesResult> {
  const count = input.count ?? 8
  const { system, user, version } = buildDiscoveryArchetypesPrompt({
    count,
    seedPrompt: input.seedPrompt,
    editorialContext: input.editorialContext,
  })

  const result = await runAiTask<{ archetypes?: DiscoveryArchetype[] }>({
    taskKind: "discovery",
    subjectTable: "discovery_runs",
    subjectId: input.subjectId ?? null,
    promptVersion: version,
    input: { count, hasContext: Boolean(input.editorialContext) },
    prompt: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    expectJson: true,
    providerOptions: { temperature: 0.5 },
  })

  if (result.status !== "succeeded") {
    return {
      archetypes: [],
      runId: result.runId,
      ok: false,
      errorMessage: result.errorMessage,
    }
  }
  const archetypes = (result.parsed?.archetypes ?? []).filter(
    (a): a is DiscoveryArchetype =>
      Boolean(a && typeof a.id === "string" && typeof a.name === "string"),
  )
  return {
    archetypes,
    runId: result.runId,
    ok: archetypes.length > 0,
    errorMessage: archetypes.length === 0 ? "no archetypes parsed" : null,
  }
}

/** Allowed status transitions for the discovery_runs state machine. */
const RUN_TRANSITIONS: Record<DiscoveryRunStatus, DiscoveryRunStatus[]> = {
  pending: ["seeding", "cancelled", "failed"],
  seeding: ["searching", "failed", "cancelled"],
  searching: ["verifying", "failed", "cancelled"],
  verifying: ["ranking", "failed", "cancelled"],
  ranking: ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
}

export function canTransitionRun(
  from: DiscoveryRunStatus,
  to: DiscoveryRunStatus,
): boolean {
  return RUN_TRANSITIONS[from]?.includes(to) ?? false
}

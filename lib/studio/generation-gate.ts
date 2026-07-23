/**
 * Studio 3-phase journey — Step 2: the Phase-3 approval gate (pure decision).
 *
 * Content generation (Phase 3) may run for an EDITED session only after
 * its Phase-2 review is approved. This module holds the decision as a
 * PURE function so it can be unit-tested in isolation, without spinning
 * up the SSE pipeline in generate-stream/route.ts. The route resolves the
 * project (getProjectByEditedSession) and calls evaluateGenerationGate.
 *
 * The scoping is deliberate and lives entirely in the CALLER's lookup key,
 * not here: the route resolves the project by `edited_session_id`, so only
 * a session that is the edited cut of a linked `studio_projects` journey
 * yields a non-null project. Everything else — YouTube sessions (journey أ),
 * legacy imports, standalone edited-audio uploads, and raw sessions (which
 * are `raw_session_id`, never `edited_session_id`) — resolves to null and
 * is ALLOWED here, preserving the currently-working ungated flows.
 */

import type { StudioProject } from "./projects"
import type { StudioProjectState } from "@/lib/db/schema/studio-projects"

/**
 * Project states at which Phase-3 content generation is permitted: the
 * Phase-2 review has been completed and approved (`reviewed`), or the
 * journey has already moved past it (`finalized` / `published`). Earlier
 * states (`draft` / `raw_uploaded` / `mapped`) mean the review is not yet
 * approved and generation must be blocked.
 */
export const GENERATION_ALLOWED_STATES: readonly StudioProjectState[] = [
  "reviewed",
  "finalized",
  "published",
]

export type GenerationGateDecision =
  | { allowed: true; reason: "no_project" | "review_approved" }
  | { allowed: false; reason: "review_pending"; state: StudioProjectState }

/**
 * Decide whether Phase-3 content generation may run for a studio session,
 * given the project it belongs to (or null when it is not part of a linked
 * project journey).
 *
 *  - `null`  → ALLOWED (`no_project`): backward-compat contract. YouTube,
 *    legacy, standalone edited-audio, and raw sessions have no linked
 *    project and stay ungated exactly as before.
 *  - project in an allowed state → ALLOWED (`review_approved`).
 *  - project still in draft/raw_uploaded/mapped → BLOCKED (`review_pending`):
 *    the Phase-2 review has not been approved yet.
 */
export function evaluateGenerationGate(
  project: StudioProject | null,
): GenerationGateDecision {
  if (!project) return { allowed: true, reason: "no_project" }
  if (GENERATION_ALLOWED_STATES.includes(project.state)) {
    return { allowed: true, reason: "review_approved" }
  }
  return { allowed: false, reason: "review_pending", state: project.state }
}

/**
 * Studio 3-phase journey — Step 4: the read-side "journey" assembler.
 *
 * The Phase-2 review screen needs, in one shot, the project a session
 * belongs to plus the honest timestamps for its stepper: when Phase 1
 * (the map) was produced and when Phase 2 (the review) last ran. This
 * composes the existing repositories — the project repo + the analysis-
 * record store — into that view. No new persistence.
 *
 * Timestamps come straight from the analysis records the two phases
 * already write:
 *   - `mappedAt`    → the RAW session's `transcript` record `generated_at`.
 *     For a raw-map session the last write to that record is `saveEpisodeMap`,
 *     so this is honestly "when the map was generated".
 *   - `reviewedAt`  → the EDITED session's `phase2_review` record
 *     `generated_at`, written only by `saveEpisodeReview` — a clean "when
 *     the review last ran".
 * Either is `null` when its phase has not produced its record yet.
 */

import {
  getProjectByEditedSession,
  getProjectByRawSession,
  type StudioProject,
} from "./projects"
import { getStudioAnalysisRecord } from "./analysis-records"

export interface ProjectJourney {
  project: StudioProject | null
  /** When Phase 1 (the episode map) was generated, if it has been. */
  mappedAt: string | null
  /** When Phase 2 (the edit review) last ran, if it has. */
  reviewedAt: string | null
}

const EMPTY: ProjectJourney = { project: null, mappedAt: null, reviewedAt: null }

/**
 * Resolve the project a studio session belongs to (edited cut first, then
 * raw) and attach the two phase timestamps. Returns an all-null journey
 * when the session is not part of a linked project (YouTube / legacy /
 * standalone uploads) — the same backward-compatible "no project" contract
 * the generation gate uses.
 */
export async function getProjectJourneyForSession(
  sessionId: string,
): Promise<ProjectJourney> {
  const project =
    (await getProjectByEditedSession(sessionId)) ??
    (await getProjectByRawSession(sessionId))
  if (!project) return EMPTY

  const [mapRec, reviewRec] = await Promise.all([
    project.raw_session_id
      ? getStudioAnalysisRecord(project.raw_session_id, "transcript")
      : Promise.resolve(null),
    project.edited_session_id
      ? getStudioAnalysisRecord(project.edited_session_id, "phase2_review")
      : Promise.resolve(null),
  ])

  return {
    project,
    mappedAt: mapRec?.generated_at ?? null,
    reviewedAt: reviewRec?.generated_at ?? null,
  }
}

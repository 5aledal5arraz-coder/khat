/**
 * Khat Brain — Guest Discovery shared infrastructure.
 *
 * The v1 discovery engine (archetype seeding → search agents → verify →
 * rank, plus the Alpha pipeline) was retired in favour of the name-first,
 * Wikidata-anchored v2 engine (`lib/discovery-v2/`). What remains here is the
 * shared substrate v2 builds on: the discovery_runs / discovery_candidates
 * CRUD + state machine, promotion to a canonical guest, and the Khat Map
 * bridge. v2 is the single source of truth; there is no v1 anymore.
 */

export {
  createDiscoveryRun,
  getDiscoveryRun,
  listDiscoveryRuns,
  transitionDiscoveryRun,
  canTransitionRun,
  bumpCandidateCount,
  InvalidDiscoveryTransitionError,
  type DiscoveryRunRecord,
  type CreateDiscoveryRunInput,
} from "./runs"

export {
  createCandidate,
  getCandidate,
  listCandidates,
  updateCandidateVerification,
  updateCandidateScores,
  updateCandidateAlphaPayload,
  setCandidateStatus,
  type DiscoveryCandidateRecord,
  type CreateCandidateInput,
  type UpdateCandidateAlphaInput,
} from "./candidates"

export type {
  DiscoveryArchetype,
  DiscoverySourceConfig,
  DiscoveryEvidenceUrl,
  DiscoveryEvidenceSummary,
  DiscoveryPlatformSignals,
  DiscoveryStorySignals,
  DiscoveryRunStatus,
  DiscoveryCandidateStatus,
} from "./types"

export {
  bridgeDiscoveryToKhatMap,
  type BridgeInput,
  type BridgeResult,
} from "./bridge"

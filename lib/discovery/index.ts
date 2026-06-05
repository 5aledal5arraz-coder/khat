/**
 * Khat Brain Phase 5 — Hidden Guest Discovery public surface.
 */

export {
  seedArchetypes,
  canTransitionRun,
  type SeedArchetypesInput,
  type SeedArchetypesResult,
} from "./seed-archetypes"

export {
  runSearchAgent,
  type DiscoverySource,
  type SearchAgentInput,
  type SearchResult,
  type SearchCandidate,
  type DiscoveryFilterContext,
} from "./search-agents"

export {
  verifyCandidate,
  type VerifyCandidateInput,
  type VerifyCandidateResult,
} from "./verify-candidate"

export {
  rankCandidate,
  type RankCandidateInput,
  type RankResult,
} from "./rank-candidates"

export {
  createDiscoveryRun,
  getDiscoveryRun,
  listDiscoveryRuns,
  transitionDiscoveryRun,
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

// ─── Phase Alpha — Guest Discovery Excellence ────────────────────────
export {
  runAlphaPipeline,
  classifyPerson,
  verifyAttributes,
  computeEditorialFit,
  curateEvidenceBundle,
  alphaFlagEnabled,
  ALPHA_PIPELINE_VERSION,
  PERSON_CLASS_THRESHOLD,
  ATTRIBUTE_VERIFIED_THRESHOLD,
  CLASSIFIER_VERSION,
  ATTRIBUTE_VERIFIER_VERSION,
  FIT_VERSION,
  type AlphaPipelineInput,
  type AlphaPipelineDecision,
} from "./alpha"

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

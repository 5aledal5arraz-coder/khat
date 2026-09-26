/**
 * Khat Brain — Episode Intelligence Record public surface.
 */

export {
  createEpisodeIntelligenceRecord,
  getEpisodeIntelligenceRecord,
  listEpisodeIntelligenceRecords,
  transitionEpisodePhase,
  setEpisodeIntelligenceGuest,
  setEpisodeRecordingSchedule,
  patchEpisodeIntelligenceEditorial,
  countByPhase,
  getEpisodePhaseHistory,
  type EpisodeIntelligenceRecord,
  type CreateEirInput,
  type ListEirOptions,
  type TransitionInput,
  type SetEirGuestInput,
  type SetRecordingScheduleInput,
  type PatchEirEditorialInput,
  type PhaseTransitionEntry,
} from "./service"

export {
  isAllowedTransition,
  assertAllowedTransition,
  allowedNextPhases,
  InvalidPhaseTransitionError,
} from "./transitions"

export {
  EPISODE_PHASES,
  type EpisodePhase,
  type EditorialIntent,
} from "@/lib/db/schema/eir"

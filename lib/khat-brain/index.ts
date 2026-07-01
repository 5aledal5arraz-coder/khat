/**
 * Khat Brain — public bridge surface.
 *
 * Higher-level wrappers built on top of lib/eir, intended for the rest
 * of the codebase to use when integrating with the EIR spine.
 */

export {
  ensureEirForCandidate,
  walkEirToPhase,
  type EnsureEirInput,
  type EnsureEirResult,
  type WalkEirInput,
} from "./v2-bridge"

export {
  walkForwardIfBehind,
  roomStatusToPhase,
  prepStatusToPhase,
  syncEirFromRoomStatus,
  syncEirFromPrepStatus,
  syncEirOnEpisodePublish,
  syncEirOnPerformanceWrite,
  syncEirOnStudioPushed,
  getEirIdForPreparation,
  getEirIdForRoom,
  getEirIdForStudioSession,
  getEirIdForEpisode,
  type WalkResult,
  type CollaborationRoomStatus,
} from "./phase-sync"
// PreparationStatus is owned by types/preparation.ts; re-exported here for the
// callers that pull the phase-sync surface from a single barrel.
export type { PreparationStatus } from "@/types/preparation"

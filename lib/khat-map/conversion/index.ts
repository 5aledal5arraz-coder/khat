/**
 * Khat Map conversion — public surface.
 *
 * Centralizing every conversion helper here gives future extensions a
 * single place to register new targets (real-episode, newsletter-topic,
 * sponsor-opportunity, short-form clip, next-season carry-over). The
 * result shape is uniform so the UI layer never has to branch per target.
 */

export type {
  ConversionKind,
  ConversionLink,
  ConversionResult,
  ConversionHistoryRow,
} from "./types"

export {
  convertEpisodeToPreparation,
  getPreparationLinkForCandidate,
  type ConvertEpisodeToPreparationInput,
} from "./to-preparation"

export {
  convertGuestToGlobalCandidate,
  getGlobalGuestLinkForKhatMapGuest,
  type ConvertGuestToCandidateInput,
} from "./to-guest-candidate"

export { listSeasonConversions } from "./history"

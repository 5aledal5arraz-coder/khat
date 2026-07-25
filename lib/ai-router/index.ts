/**
 * Khat Brain — AI Router public surface.
 */

export { runAiTask } from "./router"
export {
  DEFAULT_MODELS,
  lookupPricing,
  getUnpricedModels,
  type ModelChoice,
} from "./registry"
export {
  GroundingContractError,
  UNGROUNDED_ERROR_CLASS,
  type GroundingContract,
} from "./grounding"
export type {
  AiTaskRequest,
  AiTaskResult,
  AiTaskKind,
  AiProvider,
  AiRunStatus,
  PromptInput,
  PromptMessage,
  ProviderAdapter,
} from "./types"

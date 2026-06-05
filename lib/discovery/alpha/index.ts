/**
 * Phase Alpha — Guest Discovery Excellence public surface.
 *
 * Import path:
 *   import { runAlphaPipeline, ... } from "@/lib/discovery/alpha"
 *
 * Alpha runs entirely client-side of the LLM stack — no AI router
 * calls. The LLM is only invoked in `lib/discovery/alpha/explainer.ts`
 * to produce the operator-facing "why this person matches" prose
 * AFTER the deterministic pipeline has decided the row is promotable.
 *
 * Feature flag: ALPHA_DISCOVERY_FLAG (true when env
 * KHAT_GUEST_DISCOVERY_V2=1). Reading the flag is centralised here so
 * downstream callers don't sprinkle env reads through the codebase.
 */

export {
  runAlphaPipeline,
  ALPHA_PIPELINE_VERSION,
  PERSON_CLASS_THRESHOLD,
  ATTRIBUTE_VERIFIED_THRESHOLD,
  type AlphaPipelineInput,
  type AlphaPipelineDecision,
} from "./pipeline"

export {
  classifyPerson,
  CLASSIFIER_VERSION,
  type PersonClassInput,
} from "./person-classifier"

export {
  verifyAttributes,
  ATTRIBUTE_VERIFIER_VERSION,
  type AttributeVerifierInput,
} from "./attribute-verifier"

export {
  computeEditorialFit,
  FIT_VERSION,
  type EditorialFitInput,
  type EditorialFitResult,
} from "./editorial-fit"

export {
  curateEvidenceBundle,
  type BundleInput,
} from "./evidence-bundle"

/**
 * Feature-flag reader. Centralised so we can switch detection later
 * without combing the codebase. Returns true when:
 *   - process.env.KHAT_GUEST_DISCOVERY_V2 === "1" / "true" / "on"
 */
export function alphaFlagEnabled(): boolean {
  const v = (process.env.KHAT_GUEST_DISCOVERY_V2 ?? "").toLowerCase().trim()
  return v === "1" || v === "true" || v === "on" || v === "yes"
}

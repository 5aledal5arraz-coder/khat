/**
 * Phase Alpha — Discovery pipeline orchestrator.
 *
 * Given a raw candidate (proposed name + evidence URLs + archetype +
 * optional episode context), runs the full Alpha stack and returns the
 * fields needed to write/update the candidate row.
 *
 * Pipeline order (each stage is deterministic + dependency-free):
 *
 *   1. classifyPerson()          — 6 signals → identity_confidence
 *   2. verifyAttributes()        — nationality + gender triangulation
 *   3. computeEditorialFit()     — fit + hidden_gem + recommendation
 *   4. curateEvidenceBundle()    — 3..5 cited sources
 *
 * Then the orchestrator decides:
 *
 *   - drop the row when identity_confidence < PERSON_CLASS_THRESHOLD
 *     (writes status='rejected' + dropped_reason)
 *   - drop the row when filters set AND attribute conflicts with
 *     value at confidence ≥ 0.5 (more permissive than current
 *     `filter_mismatch` because we now have a confidence signal)
 *   - otherwise: persist with recommendation_score + display_name
 *
 * Prose explanation (why_this_person + why_now) is the LLM's only job
 * in Alpha — produced by `lib/discovery/alpha/explainer.ts` AFTER the
 * row has passed identity + attribute gates. This is the "generative
 * demoted to explanation-only" rule.
 */

import {
  classifyPerson,
  CLASSIFIER_VERSION,
  PERSON_CLASS_THRESHOLD,
} from "./person-classifier"
import {
  verifyAttributes,
  ATTRIBUTE_VERIFIED_THRESHOLD,
  ATTRIBUTE_VERIFIER_VERSION,
} from "./attribute-verifier"
import {
  computeEditorialFit,
  FIT_VERSION,
} from "./editorial-fit"
import { curateEvidenceBundle } from "./evidence-bundle"
import type {
  AlphaAttributeConfidences,
  AlphaEvidenceBundle,
  AlphaPersonClassReport,
  DiscoveryArchetype,
  DiscoveryEvidenceUrl,
  DiscoveryPlatformSignals,
} from "@/lib/db/schema/discovery"

export const ALPHA_PIPELINE_VERSION = "alpha"

export interface AlphaPipelineInput {
  proposed_name: string | null
  proposed_role: string | null
  proposed_country: string | null
  evidence_urls: DiscoveryEvidenceUrl[]
  platform_signals: DiscoveryPlatformSignals | null
  archetype: DiscoveryArchetype | null
  filters?: {
    gender?: "male" | "female"
    nationality?: "kuwaiti" | "non_kuwaiti"
  }
  episodeContext?: {
    workingTitle: string
    topicDomain?: string | null
    intentText?: string | null
  }
  /**
   * Phase Beta — operator hiddenness preference. Threaded into
   * editorial-fit weighting. Defaults to "balanced".
   */
  hiddennessPreference?: "famous" | "balanced" | "hidden_gems"
}

export interface AlphaPipelineDecision {
  /**
   * "promote"  — row passes all gates, persist with full Alpha payload
   * "drop"     — row fails a gate; status='rejected' with dropped_reason
   */
  decision: "promote" | "drop"
  dropped_reason: string | null

  pipeline_version: typeof ALPHA_PIPELINE_VERSION
  display_name: string | null
  full_name_normalized: string | null

  classifier_report: AlphaPersonClassReport
  identity_confidence: number
  attributes: AlphaAttributeConfidences
  evidence_bundle: AlphaEvidenceBundle

  editorial_fit_score: number
  hidden_gem_score: number
  evidence_strength_score: number
  recommendation_score: number

  /**
   * Engine versions stamped into the row so historical comparisons
   * (e.g. Alpha v1 vs v2 once we iterate) stay reproducible.
   */
  versions: {
    classifier: string
    attributes: string
    fit: string
    pipeline: string
  }
}

export function runAlphaPipeline(
  input: AlphaPipelineInput,
): AlphaPipelineDecision {
  const name = (input.proposed_name ?? "").trim()
  const evidence = input.evidence_urls ?? []

  // ─── 1. Identity ─────────────────────────────────────────────────
  const classifier = classifyPerson({
    proposed_name: name || null,
    evidence_urls: evidence,
  })

  // ─── 2. Attributes ───────────────────────────────────────────────
  const attributes = verifyAttributes({
    proposed_name: name || null,
    evidence_urls: evidence,
    proposed_country: input.proposed_country,
  })

  // ─── 3. Fit + recommendation ─────────────────────────────────────
  const fit = computeEditorialFit({
    archetype: input.archetype,
    evidence_urls: evidence,
    platform_signals: input.platform_signals,
    episode_topic_domain: input.episodeContext?.topicDomain ?? null,
    episode_working_title: input.episodeContext?.workingTitle ?? null,
    episode_intent_text: input.episodeContext?.intentText ?? null,
    identity_confidence: classifier.composite,
    hiddenness_preference: input.hiddennessPreference ?? "balanced",
  })

  // ─── 4. Evidence bundle ──────────────────────────────────────────
  const evidence_bundle = curateEvidenceBundle({
    evidence_urls: evidence,
    classifier_report: classifier,
    attributes,
  })

  // ─── Decision ────────────────────────────────────────────────────
  // Gate 1: person-class
  if (classifier.composite < PERSON_CLASS_THRESHOLD) {
    return drop({
      reason: `person_class_below_threshold (composite=${classifier.composite}, threshold=${PERSON_CLASS_THRESHOLD})`,
      classifier,
      attributes,
      evidence_bundle,
      fit,
      name,
    })
  }
  // Gate 2: name presence
  if (!name) {
    return drop({
      reason: "missing_name",
      classifier,
      attributes,
      evidence_bundle,
      fit,
      name,
    })
  }
  // Gate 3: hard filter (only when attribute confidence is high enough
  // to act on; below that, we keep the row but flag uncertainty).
  // Attribute drop gate uses 0.40 confidence. Empirically, attribute
  // verifier confidence on strong fixtures (fx-006 female, fx-011
  // Lebanese, fx-007 Egyptian) lands in 0.40-0.65. Below 0.40 the
  // signal is too weak to act on — those rows survive the gate and
  // the operator sees the uncertainty badge. This is the "no silent
  // fallback" rule.
  const ATTR_DROP_CONFIDENCE = 0.40
  if (input.filters?.gender) {
    const { value, confidence } = attributes.gender
    if (value && value !== input.filters.gender && confidence >= ATTR_DROP_CONFIDENCE) {
      return drop({
        reason: `gender_mismatch (filter=${input.filters.gender}, detected=${value}@${confidence})`,
        classifier,
        attributes,
        evidence_bundle,
        fit,
        name,
      })
    }
  }
  if (input.filters?.nationality) {
    const { value, confidence } = attributes.nationality
    if (value && value !== input.filters.nationality && confidence >= ATTR_DROP_CONFIDENCE) {
      return drop({
        reason: `nationality_mismatch (filter=${input.filters.nationality}, detected=${value}@${confidence})`,
        classifier,
        attributes,
        evidence_bundle,
        fit,
        name,
      })
    }
  }

  // Promote
  return {
    decision: "promote",
    dropped_reason: null,
    pipeline_version: ALPHA_PIPELINE_VERSION,
    display_name: name,
    full_name_normalized: normalizeName(name),
    classifier_report: classifier,
    identity_confidence: classifier.composite,
    attributes,
    evidence_bundle,
    editorial_fit_score: fit.editorial_fit_score,
    hidden_gem_score: fit.hidden_gem_score,
    evidence_strength_score: fit.evidence_strength_score,
    recommendation_score: fit.recommendation_score,
    versions: {
      classifier: CLASSIFIER_VERSION,
      attributes: ATTRIBUTE_VERIFIER_VERSION,
      fit: FIT_VERSION,
      pipeline: ALPHA_PIPELINE_VERSION,
    },
  }
}

function drop(args: {
  reason: string
  classifier: AlphaPersonClassReport
  attributes: AlphaAttributeConfidences
  evidence_bundle: AlphaEvidenceBundle
  fit: ReturnType<typeof computeEditorialFit>
  name: string
}): AlphaPipelineDecision {
  return {
    decision: "drop",
    dropped_reason: args.reason,
    pipeline_version: ALPHA_PIPELINE_VERSION,
    display_name: args.name || null,
    full_name_normalized: args.name ? normalizeName(args.name) : null,
    classifier_report: args.classifier,
    identity_confidence: args.classifier.composite,
    attributes: args.attributes,
    evidence_bundle: args.evidence_bundle,
    editorial_fit_score: args.fit.editorial_fit_score,
    hidden_gem_score: args.fit.hidden_gem_score,
    evidence_strength_score: args.fit.evidence_strength_score,
    recommendation_score: args.fit.recommendation_score,
    versions: {
      classifier: CLASSIFIER_VERSION,
      attributes: ATTRIBUTE_VERIFIER_VERSION,
      fit: FIT_VERSION,
      pipeline: ALPHA_PIPELINE_VERSION,
    },
  }
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,;:!؟،؛"'«»“”‘’()\[\]{}\-—–_/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export {
  PERSON_CLASS_THRESHOLD,
  ATTRIBUTE_VERIFIED_THRESHOLD,
}

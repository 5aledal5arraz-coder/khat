/**
 * Editorial assembly — fuse a generated candidate with the Editorial Court's
 * verdict into the persisted `KhatMapEditorialIntel` + the 0-100 Success Score.
 *
 * The court's success dimensions are authoritative when present (it calibrates
 * harder than the self-biased generator); otherwise the generator's self-score
 * is used. Labels are denormalized here so the UI never imports the data modules.
 *
 * Pure functions. No I/O.
 */

import { clampSubcategory, subcategoryLabel } from "./knowledge-universe"
import { clampLenses, lensLabel } from "./lenses"
import { clampTitleSet, TITLE_VARIANT_KINDS } from "./headline-principles"
import {
  clampSuccessDimensions,
  computeSuccessScore,
  type SuccessDimensions,
} from "./success-score"
import type { RawCandidate, CourtVerdict } from "./types"
import type {
  KhatMapEditorialIntel,
  KhatMapTitleOption,
} from "@/types/khat-map"

export interface AssembledEditorial {
  editorial_intel: KhatMapEditorialIntel
  success_score: number
  subcategory: string | null
}

/**
 * Build the persisted editorial intel + success score for one candidate.
 * `verdict` is the Editorial Court's review (null when the court was skipped).
 */
export function assembleEditorial(
  raw: RawCandidate,
  verdict: CourtVerdict | null,
): AssembledEditorial {
  const topic = raw.topic
  const subcategory = clampSubcategory(topic.subcategory, topic.category)
  const lenses = clampLenses(topic.lenses)
  const titleSet = clampTitleSet(topic.titles, topic.working_title)

  // The court's scoring wins when present; else the generator's self-score.
  const selfScore: SuccessDimensions = clampSuccessDimensions(topic.success)
  const dims: SuccessDimensions = verdict ? verdict.success : selfScore
  const success_score = computeSuccessScore(dims)

  const titles: KhatMapTitleOption[] = TITLE_VARIANT_KINDS.flatMap((kind) => {
    const text = titleSet.variants[kind.id]
    return text ? [{ kind: kind.id, label_ar: kind.label_ar, text }] : []
  })

  // The court may override the recommended title; fall back to the generator's.
  const recommended_title =
    verdict?.recommended_title?.trim() || titleSet.recommended_title || topic.working_title
  const recommended_kind = titleSet.recommended ?? null
  const recommended_reason =
    verdict?.recommended_reason?.trim() || titleSet.recommended_reason || null

  const editorial_intel: KhatMapEditorialIntel = {
    subcategory,
    subcategory_label: subcategory ? subcategoryLabel(subcategory) : null,
    lenses,
    lens_labels: lenses.map((l) => lensLabel(l)),
    titles,
    recommended_title,
    recommended_kind,
    recommended_reason,
    global_note: topic.global_note ?? null,
    debate_axis: topic.debate_axis ?? null,
    viral_angle: topic.viral_angle ?? null,
    why_this_topic: topic.why_this_topic ?? null,
    why_this_title: recommended_reason,
    why_succeed: verdict?.why_succeed ?? null,
    why_fail: verdict?.why_fail ?? null,
    is_overdone: verdict ? verdict.is_overdone : null,
    reference_potential: verdict ? verdict.reference_potential : null,
    clip_potential: verdict ? verdict.clip_potential : null,
    guest_idea: topic.guest_idea ?? null,
    success_dimensions: dims as unknown as Record<string, number>,
  }

  return { editorial_intel, success_score, subcategory }
}

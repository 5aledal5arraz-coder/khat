/**
 * Studio 3-phase journey — Step 4: the project STEPPER + approval-gate
 * derivations, as PURE functions (no DB, no React, no I/O).
 *
 * The Phase-2 review screen and the session list both need to turn a
 * `studio_projects.state` into UI decisions: which of the three journey
 * steps is done / current / locked, and how many review notes still need
 * Khaled's eyes before he approves. Keeping that logic here — free of any
 * db or JSX import — means it is unit-tested in isolation, and the
 * components stay dumb renderers of the returned model.
 *
 * The honesty principle (same spine as the Phase-1 map + the Phase-2
 * review algorithm) shows up here as `attentionCount`: a `not_applied`,
 * `partial`, or `uncertain` note is NEVER folded into the "all good"
 * count — those are exactly the verdicts Khaled must see before he
 * approves past them.
 */

import type { StudioProjectState } from "@/lib/db/schema/studio-projects"
import type {
  EpisodeReview,
  ReviewNoteStatus,
} from "@/lib/studio/episode-review"

// ─── The 3-step stepper ──────────────────────────────────────────────────────

/**
 * A single step's visual state, in the vocabulary Sara asked us to reuse
 * (AI_STATUS_CONFIG in studio-client): `done` → CheckCircle2 (emerald),
 * `current` → CircleDot (blue, actionable now), `pending`/`locked` →
 * Circle (muted). `locked` additionally reads as "not reachable yet" (a
 * lock affordance) — Phase 3 is locked until the review is approved.
 */
export type StepState = "done" | "current" | "pending" | "locked"

export interface StepperModel {
  /** المرحلة ١ — الخريطة الزمنية (Phase 1). */
  map: StepState
  /** المرحلة ٢ — المراجعة (Phase 2). */
  review: StepState
  /** المرحلة ٣ — حزمة النشر (Phase 3). */
  publish: StepState
}

/**
 * Derive the three step states from the project's journey state. This is
 * the single source of truth the stepper renders — a `switch` over the
 * ordered state machine, so an added state is a compile error until it is
 * handled here.
 *
 *   draft / raw_uploaded → map is the live step; review pending; publish locked
 *   mapped               → map done; review is the live step; publish locked
 *   reviewed             → map+review done; publish now available (unlocked)
 *   finalized            → map+review done; publish in progress
 *   published            → all three done
 */
export function deriveStepperModel(state: StudioProjectState): StepperModel {
  switch (state) {
    case "draft":
    case "raw_uploaded":
      return { map: "current", review: "pending", publish: "locked" }
    case "mapped":
      return { map: "done", review: "current", publish: "locked" }
    case "reviewed":
      return { map: "done", review: "done", publish: "current" }
    case "finalized":
      return { map: "done", review: "done", publish: "current" }
    case "published":
      return { map: "done", review: "done", publish: "done" }
  }
}

/** True once the Phase-2 review is approved (or the journey moved past it). */
export function isReviewApproved(state: StudioProjectState): boolean {
  return state === "reviewed" || state === "finalized" || state === "published"
}

// ─── Approval-gate note accounting (the honesty gate) ────────────────────────

/**
 * Note verdicts that MUST be surfaced above the approve button. A clean
 * `applied` is the only verdict that does not demand a second look;
 * everything else — the break he forgot (`not_applied`), the half-cut
 * (`partial`), and the one the algorithm could not prove (`uncertain`) —
 * is "attention". Deliberately excludes `applied`; `extra_cut`s are
 * informational (a separate list), not a blocker.
 */
export const ATTENTION_NOTE_STATUSES: readonly ReviewNoteStatus[] = [
  "not_applied",
  "partial",
  "uncertain",
]

/**
 * How many review notes need Khaled's eyes before approval. Reads the
 * review's own summary (the algorithm already counted each bucket), so
 * this never re-derives verdicts — it only sums the attention buckets.
 * `null`/no-review ⇒ 0.
 */
export function attentionCount(review: EpisodeReview | null): number {
  if (!review) return 0
  const s = review.summary
  return s.not_applied + s.partial + s.uncertain
}

/** Notes he did not (fully) apply — `not_applied` + `partial`. */
export function notAppliedCount(review: EpisodeReview | null): number {
  if (!review) return 0
  return review.summary.not_applied + review.summary.partial
}

/** Notes the algorithm could not prove either way — `uncertain`. */
export function uncertainCount(review: EpisodeReview | null): number {
  if (!review) return 0
  return review.summary.uncertain
}

// ─── Session-list phase presentation (raw vs edited, + phase state) ───────────

/** Which leg of the journey an audio session is — surfaced in the list. */
export type SessionStageTone = "raw" | "edited"

export interface SessionPhaseInfo {
  /** Short Arabic role label: the raw recording vs the post-montage cut. */
  stageLabel: string
  stageTone: SessionStageTone
  /** The project's phase, if the session belongs to a linked project. */
  phaseLabel: string | null
}

/** Arabic phase label for a project state — used in the session list chip. */
export function phaseLabelForState(state: StudioProjectState): string {
  switch (state) {
    case "draft":
    case "raw_uploaded":
      return "بانتظار الخريطة"
    case "mapped":
      return "بانتظار المراجعة"
    case "reviewed":
      return "تمت المراجعة"
    case "finalized":
      return "جاهزة للنشر"
    case "published":
      return "منشورة"
  }
}

/**
 * Derive the session-list presentation for an audio session from its
 * `audio_stage` and (optionally) the state of the project it belongs to.
 * Pure — the row component maps the returned tones to classes/icons.
 */
export function sessionPhaseInfo(
  audioStage: "raw" | "edited" | null,
  projectState: StudioProjectState | null,
): SessionPhaseInfo {
  const isRaw = audioStage === "raw"
  return {
    stageLabel: isRaw ? "تسجيل خام" : "بعد المونتاج",
    stageTone: isRaw ? "raw" : "edited",
    phaseLabel: projectState ? phaseLabelForState(projectState) : null,
  }
}

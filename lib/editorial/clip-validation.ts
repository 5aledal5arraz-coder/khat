/**
 * UX-9 — Clip validation.
 *
 * Mirrors the chapter-validation.ts shape so the UI can swap one for
 * the other without re-learning the contract. Pure functions; no I/O.
 *
 * Severity model (same as chapter-validation):
 *   • blocker — prevents approval / export
 *   • warning — operator should review but can ship
 *   • info    — purely advisory
 */

import {
  clipEditorialWeight,
  type Clip,
  type ClipDocument,
} from "./clip-types"

export type ValidationSeverity = "blocker" | "warning" | "info"

export interface ValidationIssue {
  code: string
  severity: ValidationSeverity
  message: string
  /** Clip ids the issue applies to. Length 0 ⇒ document-level. */
  clip_ids: string[]
}

export interface ClipValidationLimits {
  /** Min clip length, seconds. Below ⇒ warning. */
  min_clip_seconds: number
  /** Max clip length, seconds. Above ⇒ warning. */
  max_clip_seconds: number
  /** Optimum length range — clips inside this window are "ideal" for
   *  short-form. We surface clips outside as warnings. */
  ideal_min_seconds: number
  ideal_max_seconds: number
  /** Min hook score below which we flag the hook as weak. */
  min_hook_score: number
  /** Max overall clips per episode. Above ⇒ warning. */
  max_clips: number
  min_title_words: number
  min_hook_words: number
}

export const DEFAULT_CLIP_VALIDATION_LIMITS: ClipValidationLimits = {
  min_clip_seconds: 8,
  max_clip_seconds: 180,
  ideal_min_seconds: 25,
  ideal_max_seconds: 75,
  min_hook_score: 55,
  max_clips: 24,
  min_title_words: 3,
  min_hook_words: 5,
}

export interface ClipValidationResult {
  issues: ValidationIssue[]
  blockerCount: number
  warningCount: number
  infoCount: number
  canApprove: boolean
}

export function validateClipDocument(
  doc: ClipDocument,
  limits: ClipValidationLimits = DEFAULT_CLIP_VALIDATION_LIMITS,
): ClipValidationResult {
  const issues: ValidationIssue[] = []
  const clips = [...doc.clips].sort(
    (a, b) => a.start_seconds - b.start_seconds,
  )

  for (const c of clips) {
    if (!c.title.trim()) {
      issues.push({
        code: "empty_title",
        severity: "blocker",
        message: "العنوان فارغ",
        clip_ids: [c.id],
      })
    } else if (
      c.title.trim().split(/\s+/).filter(Boolean).length < limits.min_title_words
    ) {
      issues.push({
        code: "weak_title",
        severity: "warning",
        message: "عنوان قصير جداً",
        clip_ids: [c.id],
      })
    }

    if (!c.hook.trim()) {
      issues.push({
        code: "empty_hook",
        severity: "warning",
        message: "بدون خطّاف — أضف جملة افتتاحية قوية",
        clip_ids: [c.id],
      })
    } else if (
      c.hook.trim().split(/\s+/).filter(Boolean).length < limits.min_hook_words
    ) {
      issues.push({
        code: "short_hook",
        severity: "warning",
        message: "الخطّاف قصير — وسّعه ليجذب الانتباه",
        clip_ids: [c.id],
      })
    }

    if (c.end_seconds <= c.start_seconds) {
      issues.push({
        code: "invalid_range",
        severity: "blocker",
        message: "نهاية المقطع قبل أو تساوي بدايته",
        clip_ids: [c.id],
      })
    } else {
      const length = c.end_seconds - c.start_seconds
      if (length < limits.min_clip_seconds) {
        issues.push({
          code: "too_short",
          severity: "warning",
          message: `المقطع قصير (${Math.round(length)} ث، الحد ${limits.min_clip_seconds} ث)`,
          clip_ids: [c.id],
        })
      } else if (length > limits.max_clip_seconds) {
        issues.push({
          code: "too_long",
          severity: "warning",
          message: `المقطع طويل (${Math.round(length / 60)} د، الحد ${Math.round(limits.max_clip_seconds / 60)} د)`,
          clip_ids: [c.id],
        })
      } else if (
        length < limits.ideal_min_seconds ||
        length > limits.ideal_max_seconds
      ) {
        issues.push({
          code: "outside_ideal_window",
          severity: "info",
          message: `خارج النطاق المثالي (${limits.ideal_min_seconds}-${limits.ideal_max_seconds} ث)`,
          clip_ids: [c.id],
        })
      }
    }

    if (
      doc.total_duration_seconds !== null &&
      c.end_seconds > doc.total_duration_seconds + 1
    ) {
      issues.push({
        code: "outside_duration",
        severity: "blocker",
        message: "المقطع يمتد بعد نهاية الحلقة",
        clip_ids: [c.id],
      })
    }

    if (c.hook_score < limits.min_hook_score) {
      issues.push({
        code: "low_hook_score",
        severity: "warning",
        message: `قوة الخطّاف منخفضة (${c.hook_score})`,
        clip_ids: [c.id],
      })
    }

    if (c.platform_targets.length === 0) {
      issues.push({
        code: "no_platform_target",
        severity: "warning",
        message: "لم تُحدَّد منصّة نشر",
        clip_ids: [c.id],
      })
    }

    if (c.status === "approved" && !c.thumbnail_text) {
      issues.push({
        code: "approved_without_thumbnail_text",
        severity: "warning",
        message: "معتمد بدون نصّ صورة مصغّرة",
        clip_ids: [c.id],
      })
    }

    if (c.source === "ai_generated" && c.status === "draft") {
      issues.push({
        code: "ai_unreviewed",
        severity: "info",
        message: "مولَّد بالذكاء الاصطناعي — يحتاج مراجعة",
        clip_ids: [c.id],
      })
    }
  }

  // Pairwise: duplicate ranges (warning).
  for (let i = 0; i < clips.length - 1; i++) {
    for (let j = i + 1; j < clips.length; j++) {
      const a = clips[i]
      const b = clips[j]
      if (a.start_seconds === b.start_seconds && a.end_seconds === b.end_seconds) {
        issues.push({
          code: "duplicate_range",
          severity: "warning",
          message: "مقطعان بنفس النطاق الزمني",
          clip_ids: [a.id, b.id],
        })
      }
    }
  }

  if (clips.length > limits.max_clips) {
    issues.push({
      code: "too_many_clips",
      severity: "warning",
      message: `عدد المقاطع (${clips.length}) يتجاوز الحد الموصى به (${limits.max_clips})`,
      clip_ids: [],
    })
  }

  // Approve-with-blocker safety guard.
  for (const c of clips) {
    if (c.status === "approved" || c.status === "exported") {
      const hasBlocker = issues.some(
        (i) => i.severity === "blocker" && i.clip_ids.includes(c.id),
      )
      if (hasBlocker) {
        issues.push({
          code: "approved_with_blocker",
          severity: "blocker",
          message: "مقطع معتمد رغم وجود أخطاء — راجع قبل النشر",
          clip_ids: [c.id],
        })
      }
    }
  }

  const blockerCount = issues.filter((i) => i.severity === "blocker").length
  const warningCount = issues.filter((i) => i.severity === "warning").length
  const infoCount = issues.filter((i) => i.severity === "info").length

  return {
    issues,
    blockerCount,
    warningCount,
    infoCount,
    canApprove: blockerCount === 0,
  }
}

export function issuesForClip(
  res: ClipValidationResult,
  clipId: string,
): ValidationIssue[] {
  return res.issues.filter((i) => i.clip_ids.includes(clipId))
}

// ─── Filtering / queue helpers ──────────────────────────────────────

export type ClipQueueMode =
  | "all"
  | "priority"
  | "must_publish"
  | "draft"
  | "approved"
  | "export_ready"

export function filterClipsForQueue(
  clips: Clip[],
  mode: ClipQueueMode,
): Clip[] {
  switch (mode) {
    case "all":
      return clips
    case "priority":
      return clips.filter(
        (c) => c.mark === "priority" || clipEditorialWeight(c) >= 70,
      )
    case "must_publish":
      return clips.filter((c) => c.mark === "must_publish")
    case "draft":
      return clips.filter((c) => c.status === "draft")
    case "approved":
      return clips.filter((c) => c.status === "approved")
    case "export_ready":
      return clips.filter(
        (c) =>
          (c.status === "approved" || c.status === "exported") &&
          c.thumbnail_text !== null &&
          c.platform_targets.length > 0,
      )
  }
}

export interface ClipFilterOptions {
  query?: string
  minScore?: number
  platform?: string
  status?: string
}

export function searchAndFilterClips(
  clips: Clip[],
  opts: ClipFilterOptions,
): Clip[] {
  const q = (opts.query ?? "").trim().toLowerCase()
  return clips.filter((c) => {
    if (q) {
      const hay = [
        c.title,
        c.hook,
        c.summary ?? "",
        c.caption_suggestion ?? "",
        c.thumbnail_text ?? "",
        c.hashtags.join(" "),
        c.editor_notes ?? "",
      ]
        .join(" ")
        .toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (opts.minScore !== undefined && clipEditorialWeight(c) < opts.minScore)
      return false
    if (opts.platform && !c.platform_targets.includes(opts.platform as never))
      return false
    if (opts.status && c.status !== opts.status) return false
    return true
  })
}

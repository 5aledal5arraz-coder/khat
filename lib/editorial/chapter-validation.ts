/**
 * UX-8 Phase A + F — Chapter document validation.
 *
 * Pure functions. The chapter editor calls these on every state
 * change to surface warnings + block "Approve" when invariants are
 * violated. No I/O, no React, no DOM.
 *
 * Severity model:
 *   • "blocker" — prevents publishing / approval. Examples: empty
 *     title, overlapping chapters, end < start.
 *   • "warning" — operator should review but can ship. Examples:
 *     gap longer than X seconds, very-short chapter, weak title.
 *   • "info"    — purely advisory. Example: AI-generated chapter
 *     hasn't been reviewed yet.
 *
 * Operator-facing copy is Arabic. The English `code` is a stable
 * machine identifier the smoke + future telemetry use.
 */

import type { Chapter, ChapterDocument } from "./chapter-types"

export type ValidationSeverity = "blocker" | "warning" | "info"

export interface ValidationIssue {
  code: string
  severity: ValidationSeverity
  message: string
  /** Chapter ids the issue applies to. Length 0 ⇒ document-level. */
  chapter_ids: string[]
}

export interface ValidationLimits {
  /** Min chapter length, seconds. Below ⇒ warning. */
  min_chapter_seconds: number
  /** Max chapter length, seconds. Above ⇒ warning. */
  max_chapter_seconds: number
  /** Acceptable gap (seconds) between chapter end and next chapter
   *  start. Above ⇒ warning. */
  max_gap_seconds: number
  /** Min number of chapters per episode. Below ⇒ warning. */
  min_chapters: number
  /** Max number of chapters per episode. Above ⇒ warning. */
  max_chapters: number
  /** Min title length (Arabic-friendly: words, not chars). */
  min_title_words: number
}

export const DEFAULT_VALIDATION_LIMITS: ValidationLimits = {
  min_chapter_seconds: 30,
  max_chapter_seconds: 60 * 30, // 30 min
  max_gap_seconds: 5,
  min_chapters: 3,
  max_chapters: 24,
  min_title_words: 2,
}

export interface ValidationResult {
  issues: ValidationIssue[]
  blockerCount: number
  warningCount: number
  infoCount: number
  /** Convenience — true iff there are zero blockers. */
  canApprove: boolean
}

export function validateChapterDocument(
  doc: ChapterDocument,
  limits: ValidationLimits = DEFAULT_VALIDATION_LIMITS,
): ValidationResult {
  const issues: ValidationIssue[] = []
  const sorted = [...doc.chapters].sort(
    (a, b) => a.start_seconds - b.start_seconds,
  )

  // ── Per-chapter checks ──────────────────────────────────────────
  for (const c of sorted) {
    if (!c.title.trim()) {
      issues.push({
        code: "empty_title",
        severity: "blocker",
        message: "العنوان فارغ",
        chapter_ids: [c.id],
      })
    } else {
      const words = c.title.trim().split(/\s+/).filter(Boolean)
      if (words.length < limits.min_title_words) {
        issues.push({
          code: "weak_title",
          severity: "warning",
          message: `العنوان قصير جداً (${words.length} كلمة)`,
          chapter_ids: [c.id],
        })
      }
      if (/[A-Za-z]/.test(c.title) && doc.language === "ar") {
        issues.push({
          code: "non_arabic_in_title",
          severity: "warning",
          message: "العنوان يحتوي حروف لاتينية — راجع لغة الحلقة",
          chapter_ids: [c.id],
        })
      }
    }

    if (c.end_seconds !== null && c.end_seconds <= c.start_seconds) {
      issues.push({
        code: "invalid_range",
        severity: "blocker",
        message: "نهاية الفصل قبل أو تساوي بدايته",
        chapter_ids: [c.id],
      })
    }

    const length =
      c.end_seconds !== null ? c.end_seconds - c.start_seconds : null
    if (length !== null && length < limits.min_chapter_seconds) {
      issues.push({
        code: "too_short",
        severity: "warning",
        message: `الفصل قصير (${Math.round(length)} ث، الحد ${limits.min_chapter_seconds} ث)`,
        chapter_ids: [c.id],
      })
    }
    if (length !== null && length > limits.max_chapter_seconds) {
      issues.push({
        code: "too_long",
        severity: "warning",
        message: `الفصل طويل (${Math.round(length / 60)} د، الحد ${Math.round(limits.max_chapter_seconds / 60)} د)`,
        chapter_ids: [c.id],
      })
    }

    if (c.source === "ai_generated" && c.status === "draft") {
      issues.push({
        code: "ai_unreviewed",
        severity: "info",
        message: "فصل مُولَّد بالذكاء الاصطناعي — يحتاج مراجعة",
        chapter_ids: [c.id],
      })
    }

    if (
      doc.total_duration_seconds !== null &&
      c.start_seconds > doc.total_duration_seconds
    ) {
      issues.push({
        code: "outside_duration",
        severity: "blocker",
        message: "بداية الفصل بعد نهاية الحلقة",
        chapter_ids: [c.id],
      })
    }
  }

  // ── Pairwise checks (overlaps + gaps + duplicates) ──────────────
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i]
    const next = sorted[i + 1]
    const curEnd = cur.end_seconds ?? next.start_seconds
    if (curEnd > next.start_seconds) {
      issues.push({
        code: "overlap",
        severity: "blocker",
        message: `الفصلان متداخلان (${formatTime(curEnd)} → ${formatTime(next.start_seconds)})`,
        chapter_ids: [cur.id, next.id],
      })
    } else if (
      cur.end_seconds !== null &&
      next.start_seconds - cur.end_seconds > limits.max_gap_seconds
    ) {
      const gap = Math.round(next.start_seconds - cur.end_seconds)
      issues.push({
        code: "gap_too_large",
        severity: "warning",
        message: `فجوة بين الفصول: ${gap} ث (الحد ${limits.max_gap_seconds} ث)`,
        chapter_ids: [cur.id, next.id],
      })
    }
    if (
      cur.title.trim() &&
      next.title.trim() &&
      cur.title.trim() === next.title.trim()
    ) {
      issues.push({
        code: "duplicate_title",
        severity: "warning",
        message: "عنوان مكرّر في فصلين متتاليين",
        chapter_ids: [cur.id, next.id],
      })
    }
  }

  // ── Document-level checks ──────────────────────────────────────
  if (sorted.length > 0 && sorted.length < limits.min_chapters) {
    issues.push({
      code: "too_few_chapters",
      severity: "warning",
      message: `عدد الفصول (${sorted.length}) أقل من الحد الموصى به (${limits.min_chapters})`,
      chapter_ids: [],
    })
  }
  if (sorted.length > limits.max_chapters) {
    issues.push({
      code: "too_many_chapters",
      severity: "warning",
      message: `عدد الفصول (${sorted.length}) يتجاوز الحد الموصى به (${limits.max_chapters})`,
      chapter_ids: [],
    })
  }
  if (sorted.length > 0 && sorted[0].start_seconds > 60) {
    issues.push({
      code: "late_first_chapter",
      severity: "warning",
      message: `أول فصل يبدأ بعد ${Math.round(sorted[0].start_seconds)} ث — قد يكون هناك مقدمة غير مفهرسة`,
      chapter_ids: [sorted[0].id],
    })
  }
  // Approving a chapter while it has blocker-level issues is the
  // ultimate safety guard — surface it as a document-level info.
  for (const c of sorted) {
    if (c.status === "approved") {
      const blockers = issues.filter(
        (i) => i.severity === "blocker" && i.chapter_ids.includes(c.id),
      )
      if (blockers.length > 0) {
        issues.push({
          code: "approved_with_blocker",
          severity: "blocker",
          message: "فصل معتمد رغم وجود أخطاء — راجع قبل النشر",
          chapter_ids: [c.id],
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

/**
 * Convenience: return only the issues that apply to a specific
 * chapter, used for per-row badges in the editor.
 */
export function issuesForChapter(
  res: ValidationResult,
  chapterId: string,
): ValidationIssue[] {
  return res.issues.filter((i) => i.chapter_ids.includes(chapterId))
}

/**
 * Compute a "best-effort normalize" patch: snap every chapter's end
 * to the next chapter's start (closing gaps), and pad the first
 * chapter's start to 0 if it's <= 1s. Returns the patched doc;
 * caller decides whether to apply.
 */
export function normalizeChapterTimes(
  doc: ChapterDocument,
): ChapterDocument {
  const sorted = [...doc.chapters].sort(
    (a, b) => a.start_seconds - b.start_seconds,
  )
  const adjusted: Chapter[] = sorted.map((c, i, arr) => {
    let next: Chapter = c
    if (i === 0 && c.start_seconds <= 1) {
      next = { ...next, start_seconds: 0 }
    }
    if (i < arr.length - 1) {
      next = { ...next, end_seconds: arr[i + 1].start_seconds }
    }
    return next
  })
  return { ...doc, chapters: adjusted }
}

function formatTime(s: number): string {
  const total = Math.max(0, Math.floor(s))
  const m = Math.floor(total / 60)
  const sec = total % 60
  const h = Math.floor(m / 60)
  const mm = (m % 60).toString().padStart(2, "0")
  const ss = sec.toString().padStart(2, "0")
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

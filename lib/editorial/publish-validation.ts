/**
 * UX-10 — Publishing-package validation + readiness scoring.
 *
 * Pure functions. The publish editor calls these on every state
 * change to surface blockers, warnings, and a 0–100 readiness score
 * that drives the dashboard at the top of the tab.
 *
 * Identity enforcement (Khat anti-clickbait standards) lives here
 * too. We flag titles / hooks / newsletter subjects that drift
 * toward generic engagement bait — operators see a warning, never a
 * forced edit.
 */

import { isValidSlug, type WebsitePackageDocument } from "./publish-types"

export type ValidationSeverity = "blocker" | "warning" | "info"

export interface ValidationIssue {
  code: string
  severity: ValidationSeverity
  message: string
  /** Free-form section pointer, e.g. "website_package.final_title". */
  field: string | null
}

export interface PublishValidationLimits {
  min_title_words: number
  max_title_chars: number
  max_youtube_title_chars: number
  min_description_chars: number
  max_meta_description_chars: number
  min_takeaways: number
  min_keywords: number
}

export const DEFAULT_PUBLISH_LIMITS: PublishValidationLimits = {
  min_title_words: 3,
  max_title_chars: 90,
  max_youtube_title_chars: 100,
  min_description_chars: 80,
  max_meta_description_chars: 160,
  min_takeaways: 3,
  min_keywords: 3,
}

/**
 * Words / phrases that signal engagement bait. Operator gets a
 * warning. Curated for Arabic + English mixed copy.
 */
const BAIT_PHRASES = [
  "صادم",
  "لن تصدق",
  "صدمة",
  "احذر",
  "خطير جداً",
  "هذه الحقيقة",
  "you won't believe",
  "shocking",
  "this one trick",
  "exposed",
  "you need to see",
  "must watch",
  "insane",
]

/**
 * Generic, low-information words the Khat editorial standard avoids
 * in titles. Operators are nudged toward concrete editorial language.
 */
const GENERIC_TITLE_WORDS = [
  "ممتع",
  "رائع",
  "مذهل",
  "حلقة جميلة",
  "amazing",
  "interesting",
  "nice",
  "cool",
]

export interface ReadinessScore {
  /** Composite 0..100. */
  score: number
  /** Per-section breakdown for the dashboard ring. */
  breakdown: {
    website: number
    youtube: number
    social: number
    newsletter: number
    seo: number
    sponsor: number
    release: number
    identity: number
  }
  /** Plain-Arabic recommendation surfaced in the dashboard. */
  recommendation: string
}

export interface PublishValidationResult {
  issues: ValidationIssue[]
  blockerCount: number
  warningCount: number
  infoCount: number
  canPublish: boolean
  readiness: ReadinessScore
}

// ─── Public API ──────────────────────────────────────────────────

export function validateWebsitePackageDocument(
  doc: WebsitePackageDocument,
  /** Slugs already used by other episodes in the same season. The
   *  loader passes this; defaults to empty for unit tests. */
  knownSiblingSlugs: string[] = [],
  limits: PublishValidationLimits = DEFAULT_PUBLISH_LIMITS,
): PublishValidationResult {
  const issues: ValidationIssue[] = []
  const w = doc.website_package
  const yt = doc.youtube_package
  const seo = doc.seo_package
  const sponsor = doc.sponsor_package
  const newsletter = doc.newsletter_package

  // ── Website blockers ─────────────────────────────────────────
  if (!w.final_title.trim()) {
    issues.push({
      code: "missing_title",
      severity: "blocker",
      message: "العنوان النهائي مفقود",
      field: "website_package.final_title",
    })
  } else if (
    w.final_title.trim().split(/\s+/).filter(Boolean).length <
    limits.min_title_words
  ) {
    issues.push({
      code: "weak_title",
      severity: "warning",
      message: "العنوان قصير — أضف عبارة تحريرية أعمق",
      field: "website_package.final_title",
    })
  }
  if (w.final_title.length > limits.max_title_chars) {
    issues.push({
      code: "title_too_long",
      severity: "warning",
      message: `العنوان يتجاوز ${limits.max_title_chars} حرفاً — قد يُقطع في النتائج`,
      field: "website_package.final_title",
    })
  }

  if (!w.canonical_description.trim()) {
    issues.push({
      code: "missing_description",
      severity: "blocker",
      message: "الوصف الأساسي مفقود",
      field: "website_package.canonical_description",
    })
  } else if (w.canonical_description.length < limits.min_description_chars) {
    issues.push({
      code: "short_description",
      severity: "warning",
      message: "الوصف قصير — أضف سياقاً تحريرياً",
      field: "website_package.canonical_description",
    })
  }

  if (!w.slug.trim()) {
    issues.push({
      code: "missing_slug",
      severity: "blocker",
      message: "الـ slug مفقود",
      field: "website_package.slug",
    })
  } else if (!isValidSlug(w.slug)) {
    issues.push({
      code: "invalid_slug",
      severity: "blocker",
      message: "صيغة الـ slug غير صحيحة",
      field: "website_package.slug",
    })
  } else if (knownSiblingSlugs.includes(w.slug)) {
    issues.push({
      code: "duplicate_slug",
      severity: "blocker",
      message: "هذا الـ slug مستخدم في حلقة أخرى",
      field: "website_package.slug",
    })
  }

  if (w.key_takeaways.filter((t) => t.trim()).length < limits.min_takeaways) {
    issues.push({
      code: "few_takeaways",
      severity: "warning",
      message: `أضف ${limits.min_takeaways} خلاصات على الأقل`,
      field: "website_package.key_takeaways",
    })
  }
  if (w.quote_highlights.filter((q) => q.trim()).length === 0) {
    issues.push({
      code: "no_quote_highlights",
      severity: "warning",
      message: "لم تُختر أي اقتباسات",
      field: "website_package.quote_highlights",
    })
  }
  if (w.emotional_keywords.filter((k) => k.trim()).length === 0) {
    issues.push({
      code: "no_emotional_keywords",
      severity: "warning",
      message: "لا توجد كلمات عاطفية للاكتشاف",
      field: "website_package.emotional_keywords",
    })
  }
  if (w.topic_keywords.filter((k) => k.trim()).length < limits.min_keywords) {
    issues.push({
      code: "low_seo_depth",
      severity: "warning",
      message: `أضف ${limits.min_keywords} كلمات موضوعية على الأقل`,
      field: "website_package.topic_keywords",
    })
  }

  // ── YouTube ───────────────────────────────────────────────────
  if (yt.youtube_title && yt.youtube_title.length > limits.max_youtube_title_chars) {
    issues.push({
      code: "yt_title_too_long",
      severity: "warning",
      message: `عنوان YouTube يتجاوز ${limits.max_youtube_title_chars} حرفاً`,
      field: "youtube_package.youtube_title",
    })
  }

  // ── SEO ───────────────────────────────────────────────────────
  if (seo.meta_description && seo.meta_description.length > limits.max_meta_description_chars) {
    issues.push({
      code: "meta_desc_too_long",
      severity: "warning",
      message: `meta_description يتجاوز ${limits.max_meta_description_chars} حرفاً`,
      field: "seo_package.meta_description",
    })
  }
  // Duplicate title / og_title — soft alignment check.
  if (
    seo.meta_title.trim() &&
    seo.meta_title.trim() === w.final_title.trim() &&
    seo.og_title.trim() === w.final_title.trim()
  ) {
    issues.push({
      code: "seo_titles_identical",
      severity: "info",
      message: "العنوان نفسه في meta + og + final — أضف زاوية مختلفة قليلاً",
      field: "seo_package",
    })
  }

  // ── Sponsor ───────────────────────────────────────────────────
  if (
    sponsor.sponsor_mentions.length > 0 &&
    sponsor.sponsor_cta_copy.filter((c) => c.trim()).length === 0
  ) {
    issues.push({
      code: "sponsor_missing_cta",
      severity: "warning",
      message: "ذُكر راعٍ بدون نصّ CTA",
      field: "sponsor_package.sponsor_cta_copy",
    })
  }
  // Sponsor timestamp must be inside chapter_export bounds if those exist.
  if (sponsor.sponsor_timestamps.length > 0 && yt.chapter_export.length > 0) {
    const maxChap =
      Math.max(...yt.chapter_export.map((c) => c.start_seconds)) + 1
    if (sponsor.sponsor_timestamps.some((s) => s.start_seconds > maxChap + 60)) {
      issues.push({
        code: "sponsor_timestamp_mismatch",
        severity: "warning",
        message: "تختلف توقيتات الراعي بشكل كبير عن فصول YouTube",
        field: "sponsor_package.sponsor_timestamps",
      })
    }
  }

  // ── Newsletter ────────────────────────────────────────────────
  if (
    !newsletter.newsletter_subject.trim() &&
    !newsletter.newsletter_body.trim() &&
    !newsletter.newsletter_preview.trim()
  ) {
    issues.push({
      code: "missing_newsletter",
      severity: "warning",
      message: "حزمة النشرة فارغة",
      field: "newsletter_package",
    })
  }

  // ── Social ────────────────────────────────────────────────────
  const socialFilled =
    doc.social_package.instagram_caption.trim() ||
    doc.social_package.linkedin_post.trim() ||
    doc.social_package.tiktok_caption.trim() ||
    doc.social_package.x_thread.length > 0
  if (!socialFilled) {
    issues.push({
      code: "missing_social_package",
      severity: "warning",
      message: "حزمة التواصل الاجتماعي فارغة",
      field: "social_package",
    })
  }

  // ── Cross-context blockers (clips + chapters) ───────────────
  if (!doc.source_chapter_record_id) {
    issues.push({
      code: "no_chapters_linked",
      severity: "blocker",
      message: "لا توجد فصول للحلقة — أنشئها قبل النشر",
      field: null,
    })
  }
  if (!doc.source_clip_record_id) {
    issues.push({
      code: "no_clips_linked",
      severity: "blocker",
      message: "لا توجد مقاطع للحلقة — أنشئها قبل النشر",
      field: null,
    })
  }

  // ── Identity enforcement (Khat anti-clickbait) ──────────────
  identityIssues(w.final_title, "website_package.final_title").forEach((i) =>
    issues.push(i),
  )
  identityIssues(yt.youtube_title, "youtube_package.youtube_title").forEach(
    (i) => issues.push(i),
  )
  identityIssues(
    newsletter.newsletter_subject,
    "newsletter_package.newsletter_subject",
  ).forEach((i) => issues.push(i))

  // Status sanity.
  if (doc.publish_status === "ready" || doc.publish_status === "scheduled") {
    const blockersBeforeStatus = issues.filter((i) => i.severity === "blocker")
    if (blockersBeforeStatus.length > 0) {
      issues.push({
        code: "status_with_blocker",
        severity: "blocker",
        message: "تم تعليم الحلقة جاهزة رغم وجود أخطاء — راجع قبل النشر",
        field: "publish_status",
      })
    }
  }

  const blockerCount = issues.filter((i) => i.severity === "blocker").length
  const warningCount = issues.filter((i) => i.severity === "warning").length
  const infoCount = issues.filter((i) => i.severity === "info").length
  const readiness = computeReadiness(doc, issues, limits)
  return {
    issues,
    blockerCount,
    warningCount,
    infoCount,
    canPublish: blockerCount === 0,
    readiness,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

export function issuesForField(
  res: PublishValidationResult,
  field: string,
): ValidationIssue[] {
  return res.issues.filter(
    (i) => i.field === field || (i.field && i.field.startsWith(field + ".")),
  )
}

function identityIssues(text: string, field: string): ValidationIssue[] {
  if (!text) return []
  const lower = text.toLowerCase()
  const out: ValidationIssue[] = []
  for (const phrase of BAIT_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) {
      out.push({
        code: "bait_language",
        severity: "warning",
        message: `لغة إثارة («${phrase}») — لا تتوافق مع معايير خط`,
        field,
      })
      break
    }
  }
  for (const w of GENERIC_TITLE_WORDS) {
    if (lower.includes(w.toLowerCase())) {
      out.push({
        code: "generic_language",
        severity: "info",
        message: `كلمة عامة («${w}») — استبدل بلغة تحريرية أكثر تحديداً`,
        field,
      })
      break
    }
  }
  // All-caps signal (Latin) — common bait flag.
  if (/[A-Z]{6,}/.test(text)) {
    out.push({
      code: "shouting_text",
      severity: "warning",
      message: "حروف كبيرة طويلة — يبدو كصراخ",
      field,
    })
  }
  return out
}

// ─── Readiness scoring ───────────────────────────────────────────

function computeReadiness(
  doc: WebsitePackageDocument,
  issues: ValidationIssue[],
  limits: PublishValidationLimits,
): ReadinessScore {
  const breakdown = {
    website: scoreWebsite(doc, limits),
    youtube: scoreYoutube(doc),
    social: scoreSocial(doc),
    newsletter: scoreNewsletter(doc),
    seo: scoreSeo(doc, limits),
    sponsor: scoreSponsor(doc),
    release: scoreRelease(doc),
    identity: scoreIdentity(issues),
  }
  // Weighted blend — website + identity carry the most weight.
  const weighted =
    breakdown.website * 0.26 +
    breakdown.identity * 0.16 +
    breakdown.seo * 0.14 +
    breakdown.youtube * 0.12 +
    breakdown.newsletter * 0.1 +
    breakdown.social * 0.1 +
    breakdown.sponsor * 0.06 +
    breakdown.release * 0.06
  const score = Math.max(0, Math.min(100, Math.round(weighted)))
  return { score, breakdown, recommendation: recommendationFor(score, issues) }
}

function scoreWebsite(
  doc: WebsitePackageDocument,
  limits: PublishValidationLimits,
): number {
  const w = doc.website_package
  let s = 0
  if (w.final_title.trim()) s += 22
  if (w.slug.trim() && isValidSlug(w.slug)) s += 12
  if (w.canonical_description.length >= limits.min_description_chars) s += 14
  if (w.episode_summary.trim().length > 80) s += 8
  s += Math.min(
    16,
    w.key_takeaways.filter((t) => t.trim()).length * 4,
  )
  s += Math.min(
    10,
    w.quote_highlights.filter((q) => q.trim()).length * 3,
  )
  s += Math.min(
    10,
    w.emotional_keywords.filter((k) => k.trim()).length * 2,
  )
  s += Math.min(8, w.topic_keywords.filter((k) => k.trim()).length * 2)
  return Math.min(100, s)
}
function scoreYoutube(doc: WebsitePackageDocument): number {
  const y = doc.youtube_package
  let s = 0
  if (y.youtube_title.trim()) s += 25
  if (y.youtube_description.trim().length > 100) s += 20
  if (y.pinned_comment.trim()) s += 10
  if (y.thumbnail_text_options.length > 0) s += 15
  if (y.thumbnail_direction.trim()) s += 10
  if (y.chapter_export.length > 0) s += 15
  if (y.hook_opening_line.trim()) s += 5
  return Math.min(100, s)
}
function scoreSocial(doc: WebsitePackageDocument): number {
  const so = doc.social_package
  let s = 0
  if (so.instagram_caption.trim()) s += 22
  if (so.linkedin_post.trim()) s += 18
  if (so.tiktok_caption.trim()) s += 18
  if (so.x_thread.length > 0) s += 22
  if (so.reel_hook_lines.length > 0) s += 10
  if (so.carousel_slide_copy.length > 0) s += 5
  if (so.social_ctas.length > 0) s += 5
  return Math.min(100, s)
}
function scoreNewsletter(doc: WebsitePackageDocument): number {
  const n = doc.newsletter_package
  let s = 0
  if (n.newsletter_subject.trim()) s += 30
  if (n.newsletter_preview.trim()) s += 15
  if (n.newsletter_body.trim().length > 200) s += 30
  if (n.featured_quote.trim()) s += 15
  if (n.emotional_angle.trim()) s += 10
  return Math.min(100, s)
}
function scoreSeo(
  doc: WebsitePackageDocument,
  limits: PublishValidationLimits,
): number {
  const seo = doc.seo_package
  let s = 0
  if (seo.meta_title.trim()) s += 25
  if (
    seo.meta_description.trim().length > 60 &&
    seo.meta_description.trim().length <= limits.max_meta_description_chars
  )
    s += 25
  if (seo.og_title.trim()) s += 15
  if (seo.og_description.trim()) s += 10
  if (seo.ranking_angle.trim()) s += 15
  if (seo.schema_notes.trim()) s += 10
  return Math.min(100, s)
}
function scoreSponsor(doc: WebsitePackageDocument): number {
  const sp = doc.sponsor_package
  if (sp.sponsor_mentions.length === 0) return 100 // n/a
  let s = 30
  if (sp.sponsor_cta_copy.length > 0) s += 30
  if (sp.sponsor_timestamps.length > 0) s += 20
  if (sp.compliance_notes.trim()) s += 20
  return Math.min(100, s)
}
function scoreRelease(doc: WebsitePackageDocument): number {
  const r = doc.release_strategy
  let s = 0
  if (r.release_priority !== "normal") s += 20
  if (r.release_window) s += 25
  if (r.release_reason.trim()) s += 25
  if (r.primary_platform) s += 15
  if (r.audience_target.trim()) s += 15
  return Math.min(100, s)
}
function scoreIdentity(issues: ValidationIssue[]): number {
  const baitOrShouting = issues.filter(
    (i) =>
      i.code === "bait_language" ||
      i.code === "shouting_text",
  ).length
  const generic = issues.filter((i) => i.code === "generic_language").length
  // Start at 100, lose 25 per bait flag, 8 per generic.
  return Math.max(0, 100 - baitOrShouting * 25 - generic * 8)
}

function recommendationFor(score: number, issues: ValidationIssue[]): string {
  const blockers = issues.filter((i) => i.severity === "blocker").length
  if (blockers > 0) return `${blockers} عائق يجب حلّه قبل النشر.`
  if (score >= 85) return "الحلقة جاهزة للنشر — مراجعة نهائية فقط."
  if (score >= 65) return "قاب قوسين — أكمل الأقسام الناقصة."
  if (score >= 40) return "البنية موجودة — يحتاج المحتوى تعميقاً تحريرياً."
  return "ابدأ بتعبئة العنوان والوصف والمقاطع."
}

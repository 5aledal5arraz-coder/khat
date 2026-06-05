/**
 * UX-10 — Publishing / Website-Package document model.
 *
 * Stored in `studio_analysis_records.data` for `kind="website_package"`.
 *
 * A WebsitePackageDocument is the narrative-packaging layer: it
 * carries every artifact needed to ship an episode to the world —
 * website page, YouTube package, social packages (IG/X/LinkedIn/
 * TikTok), newsletter, SEO, sponsor compliance, analytics
 * expectation, release strategy.
 *
 * The reducer + validation mirror the chapter/clip editor pattern
 * from UX-8/UX-9 so the operator's mental model stays identical.
 */

// ─── Enums ────────────────────────────────────────────────────────

export const PUBLISH_STATUSES = [
  "draft",
  "in_review",
  "ready",
  "scheduled",
  "published",
  "archived",
] as const
export type PublishStatus = (typeof PUBLISH_STATUSES)[number]

export const PUBLISH_VISIBILITY = [
  "public",
  "unlisted",
  "members_only",
  "private",
] as const
export type PublishVisibility = (typeof PUBLISH_VISIBILITY)[number]

export const FEATURED_PRIORITY = [
  "normal",
  "priority",
  "headline",
] as const
export type FeaturedPriority = (typeof FEATURED_PRIORITY)[number]

export const SEARCH_INTENTS = [
  "informational",
  "exploratory",
  "transactional",
  "navigational",
  "narrative",
] as const
export type SearchIntent = (typeof SEARCH_INTENTS)[number]

export const RELEASE_PRIORITIES = [
  "low",
  "normal",
  "high",
  "tentpole",
] as const
export type ReleasePriority = (typeof RELEASE_PRIORITIES)[number]

export const PRIMARY_PLATFORMS = [
  "website",
  "youtube",
  "spotify",
  "apple_podcasts",
  "newsletter",
] as const
export type PrimaryPlatform = (typeof PRIMARY_PLATFORMS)[number]

// ─── Sub-section shapes ───────────────────────────────────────────

export interface WebsiteSection {
  final_title: string
  subtitle: string
  slug: string
  canonical_description: string
  episode_summary: string
  key_takeaways: string[]
  quote_highlights: string[]
  emotional_keywords: string[]
  topic_keywords: string[]
  resources: Array<{ label: string; url: string }>
  guest_bio: string
  guest_links: Array<{ label: string; url: string }>
  timeline_sections: Array<{ start_seconds: number; label: string }>
  faq: Array<{ q: string; a: string }>
  reading_time_estimate_minutes: number | null
}

export interface YoutubeSection {
  youtube_title: string
  youtube_description: string
  pinned_comment: string
  chapter_export: Array<{ start_seconds: number; label: string }>
  thumbnail_text_options: string[]
  thumbnail_direction: string
  tags: string[]
  hook_opening_line: string
}

export interface SocialSection {
  instagram_caption: string
  x_thread: string[]
  linkedin_post: string
  tiktok_caption: string
  reel_hook_lines: string[]
  carousel_slide_copy: string[]
  social_ctas: string[]
}

export interface NewsletterSection {
  newsletter_subject: string
  newsletter_preview: string
  newsletter_body: string
  featured_quote: string
  emotional_angle: string
}

export interface SeoSection {
  meta_title: string
  meta_description: string
  og_title: string
  og_description: string
  schema_notes: string
  search_intent: SearchIntent
  ranking_angle: string
}

export interface SponsorSection {
  sponsor_mentions: string[]
  sponsor_timestamps: Array<{ start_seconds: number; label: string }>
  sponsor_cta_copy: string[]
  compliance_notes: string
}

export interface AnalyticsExpectation {
  /** Each 0..100. Operator's editorial forecast — used for post-
   *  release reconciliation against actual performance. */
  expected_retention: number
  expected_clip_strength: number
  expected_discussion_level: number
  expected_shareability: number
  expected_controversy: number
  confidence: number
}

export interface ReleaseStrategy {
  release_priority: ReleasePriority
  /** ISO date string or null. Free-text accepted on the editor side. */
  release_window: string | null
  release_reason: string
  primary_platform: PrimaryPlatform
  audience_target: string
  strategic_notes: string
}

// ─── Top-level document ───────────────────────────────────────────

export interface WebsitePackageDocument {
  schema_version: 1
  version: number
  language: string
  source_transcript_record_id: string | null
  source_transcript_version: number | null
  source_chapter_record_id: string | null
  source_clip_record_id: string | null
  publish_status: PublishStatus
  visibility: PublishVisibility
  featured_priority: FeaturedPriority
  website_package: WebsiteSection
  youtube_package: YoutubeSection
  social_package: SocialSection
  newsletter_package: NewsletterSection
  seo_package: SeoSection
  sponsor_package: SponsorSection
  analytics_expectation: AnalyticsExpectation
  release_strategy: ReleaseStrategy
  last_edited_by: string | null
  last_edited_at: string | null
}

// ─── Empties + factories ──────────────────────────────────────────

export function emptyWebsiteSection(): WebsiteSection {
  return {
    final_title: "",
    subtitle: "",
    slug: "",
    canonical_description: "",
    episode_summary: "",
    key_takeaways: [],
    quote_highlights: [],
    emotional_keywords: [],
    topic_keywords: [],
    resources: [],
    guest_bio: "",
    guest_links: [],
    timeline_sections: [],
    faq: [],
    reading_time_estimate_minutes: null,
  }
}

export function emptyYoutubeSection(): YoutubeSection {
  return {
    youtube_title: "",
    youtube_description: "",
    pinned_comment: "",
    chapter_export: [],
    thumbnail_text_options: [],
    thumbnail_direction: "",
    tags: [],
    hook_opening_line: "",
  }
}

export function emptySocialSection(): SocialSection {
  return {
    instagram_caption: "",
    x_thread: [],
    linkedin_post: "",
    tiktok_caption: "",
    reel_hook_lines: [],
    carousel_slide_copy: [],
    social_ctas: [],
  }
}

export function emptyNewsletterSection(): NewsletterSection {
  return {
    newsletter_subject: "",
    newsletter_preview: "",
    newsletter_body: "",
    featured_quote: "",
    emotional_angle: "",
  }
}

export function emptySeoSection(): SeoSection {
  return {
    meta_title: "",
    meta_description: "",
    og_title: "",
    og_description: "",
    schema_notes: "",
    search_intent: "narrative",
    ranking_angle: "",
  }
}

export function emptySponsorSection(): SponsorSection {
  return {
    sponsor_mentions: [],
    sponsor_timestamps: [],
    sponsor_cta_copy: [],
    compliance_notes: "",
  }
}

export function emptyAnalyticsExpectation(): AnalyticsExpectation {
  return {
    expected_retention: 50,
    expected_clip_strength: 50,
    expected_discussion_level: 50,
    expected_shareability: 50,
    expected_controversy: 30,
    confidence: 50,
  }
}

export function emptyReleaseStrategy(): ReleaseStrategy {
  return {
    release_priority: "normal",
    release_window: null,
    release_reason: "",
    primary_platform: "website",
    audience_target: "",
    strategic_notes: "",
  }
}

export function emptyWebsitePackageDocument(
  language = "ar",
): WebsitePackageDocument {
  return {
    schema_version: 1,
    version: 0,
    language,
    source_transcript_record_id: null,
    source_transcript_version: null,
    source_chapter_record_id: null,
    source_clip_record_id: null,
    publish_status: "draft",
    visibility: "public",
    featured_priority: "normal",
    website_package: emptyWebsiteSection(),
    youtube_package: emptyYoutubeSection(),
    social_package: emptySocialSection(),
    newsletter_package: emptyNewsletterSection(),
    seo_package: emptySeoSection(),
    sponsor_package: emptySponsorSection(),
    analytics_expectation: emptyAnalyticsExpectation(),
    release_strategy: emptyReleaseStrategy(),
    last_edited_by: null,
    last_edited_at: null,
  }
}

// ─── Reducer ──────────────────────────────────────────────────────

export type PublishAction =
  | { type: "patch_website"; patch: Partial<WebsiteSection> }
  | { type: "patch_youtube"; patch: Partial<YoutubeSection> }
  | { type: "patch_social"; patch: Partial<SocialSection> }
  | { type: "patch_newsletter"; patch: Partial<NewsletterSection> }
  | { type: "patch_seo"; patch: Partial<SeoSection> }
  | { type: "patch_sponsor"; patch: Partial<SponsorSection> }
  | { type: "patch_analytics"; patch: Partial<AnalyticsExpectation> }
  | { type: "patch_release"; patch: Partial<ReleaseStrategy> }
  | { type: "set_status"; status: PublishStatus }
  | { type: "set_visibility"; visibility: PublishVisibility }
  | { type: "set_featured"; priority: FeaturedPriority }

export function publishReducer(
  state: WebsitePackageDocument,
  action: PublishAction,
): WebsitePackageDocument {
  switch (action.type) {
    case "patch_website":
      return {
        ...state,
        website_package: { ...state.website_package, ...action.patch },
      }
    case "patch_youtube":
      return {
        ...state,
        youtube_package: { ...state.youtube_package, ...action.patch },
      }
    case "patch_social":
      return {
        ...state,
        social_package: { ...state.social_package, ...action.patch },
      }
    case "patch_newsletter":
      return {
        ...state,
        newsletter_package: { ...state.newsletter_package, ...action.patch },
      }
    case "patch_seo":
      return { ...state, seo_package: { ...state.seo_package, ...action.patch } }
    case "patch_sponsor":
      return {
        ...state,
        sponsor_package: { ...state.sponsor_package, ...action.patch },
      }
    case "patch_analytics":
      return {
        ...state,
        analytics_expectation: {
          ...state.analytics_expectation,
          ...clampAnalytics(action.patch),
        },
      }
    case "patch_release":
      return {
        ...state,
        release_strategy: { ...state.release_strategy, ...action.patch },
      }
    case "set_status":
      return { ...state, publish_status: action.status }
    case "set_visibility":
      return { ...state, visibility: action.visibility }
    case "set_featured":
      return { ...state, featured_priority: action.priority }
  }
}

function clampAnalytics(
  p: Partial<AnalyticsExpectation>,
): Partial<AnalyticsExpectation> {
  const out: Partial<AnalyticsExpectation> = { ...p }
  for (const k of Object.keys(out) as Array<keyof AnalyticsExpectation>) {
    const v = out[k]
    if (typeof v === "number") {
      out[k] = Math.max(0, Math.min(100, Math.round(v))) as never
    }
  }
  return out
}

// ─── Slug helpers ────────────────────────────────────────────────

const ARABIC_RANGE = "\u0600-\u06FF"
const SLUG_RE = new RegExp(
  `^[a-z0-9${ARABIC_RANGE}](?:[a-z0-9${ARABIC_RANGE}\\-]{0,118}[a-z0-9${ARABIC_RANGE}])?$`,
)

/**
 * Validate a URL slug. Latin + Arabic + digits + hyphens, 1–120 chars,
 * no leading/trailing hyphen.
 */
export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug)
}

/**
 * Generate a slug seed from an Arabic / mixed title. Strips
 * punctuation, collapses whitespace into hyphens, preserves Arabic
 * characters. Falls back to a random suffix if the result is empty.
 */
export function slugifyTitle(title: string): string {
  const trimmed = title.trim().toLowerCase()
  const stripped = trimmed.replace(
    new RegExp(`[^a-z0-9${ARABIC_RANGE}\\s\\-]`, "g"),
    "",
  )
  const slug = stripped
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
  return slug || `episode-${Math.random().toString(36).slice(2, 8)}`
}

// ─── Coercion ────────────────────────────────────────────────────

export function coerceWebsitePackageDocument(
  raw: Record<string, unknown> | null | undefined,
): WebsitePackageDocument {
  if (!raw || typeof raw !== "object") return emptyWebsitePackageDocument()
  const base = emptyWebsitePackageDocument()
  const obj = raw as Record<string, unknown>
  base.version = typeof obj.version === "number" ? obj.version : 0
  base.language = typeof obj.language === "string" ? obj.language : "ar"
  base.source_transcript_record_id =
    typeof obj.source_transcript_record_id === "string"
      ? obj.source_transcript_record_id
      : null
  base.source_transcript_version =
    typeof obj.source_transcript_version === "number"
      ? obj.source_transcript_version
      : null
  base.source_chapter_record_id =
    typeof obj.source_chapter_record_id === "string"
      ? obj.source_chapter_record_id
      : null
  base.source_clip_record_id =
    typeof obj.source_clip_record_id === "string"
      ? obj.source_clip_record_id
      : null
  base.publish_status = (PUBLISH_STATUSES as readonly string[]).includes(
    obj.publish_status as string,
  )
    ? (obj.publish_status as PublishStatus)
    : "draft"
  base.visibility = (PUBLISH_VISIBILITY as readonly string[]).includes(
    obj.visibility as string,
  )
    ? (obj.visibility as PublishVisibility)
    : "public"
  base.featured_priority = (FEATURED_PRIORITY as readonly string[]).includes(
    obj.featured_priority as string,
  )
    ? (obj.featured_priority as FeaturedPriority)
    : "normal"

  base.website_package = mergeSection(
    base.website_package,
    obj.website_package,
    coerceWebsiteSection,
  )
  base.youtube_package = mergeSection(
    base.youtube_package,
    obj.youtube_package,
    coerceYoutubeSection,
  )
  base.social_package = mergeSection(
    base.social_package,
    obj.social_package,
    coerceSocialSection,
  )
  base.newsletter_package = mergeSection(
    base.newsletter_package,
    obj.newsletter_package,
    coerceNewsletterSection,
  )
  base.seo_package = mergeSection(
    base.seo_package,
    obj.seo_package,
    coerceSeoSection,
  )
  base.sponsor_package = mergeSection(
    base.sponsor_package,
    obj.sponsor_package,
    coerceSponsorSection,
  )
  base.analytics_expectation = mergeSection(
    base.analytics_expectation,
    obj.analytics_expectation,
    coerceAnalyticsSection,
  )
  base.release_strategy = mergeSection(
    base.release_strategy,
    obj.release_strategy,
    coerceReleaseSection,
  )

  base.last_edited_at =
    typeof obj.last_edited_at === "string" ? obj.last_edited_at : null
  base.last_edited_by =
    typeof obj.last_edited_by === "string" ? obj.last_edited_by : null
  return base
}

function mergeSection<T>(
  empty: T,
  raw: unknown,
  coerce: (raw: Record<string, unknown>) => Partial<T>,
): T {
  if (!raw || typeof raw !== "object") return empty
  return { ...empty, ...coerce(raw as Record<string, unknown>) }
}

function str(v: unknown): string {
  return typeof v === "string" ? v : ""
}
function strArray(v: unknown): string[] {
  return Array.isArray(v)
    ? (v as unknown[]).filter((x): x is string => typeof x === "string" && x.length > 0)
    : []
}
function labelUrlArray(v: unknown): Array<{ label: string; url: string }> {
  if (!Array.isArray(v)) return []
  return (v as unknown[])
    .map((item) => {
      if (!item || typeof item !== "object") return null
      const o = item as Record<string, unknown>
      const label = str(o.label)
      const url = str(o.url)
      return label || url ? { label, url } : null
    })
    .filter((x): x is { label: string; url: string } => x !== null)
}
function timestampArray(
  v: unknown,
): Array<{ start_seconds: number; label: string }> {
  if (!Array.isArray(v)) return []
  return (v as unknown[])
    .map((item) => {
      if (!item || typeof item !== "object") return null
      const o = item as Record<string, unknown>
      const s = Number(o.start_seconds)
      if (!Number.isFinite(s)) return null
      return { start_seconds: Math.max(0, Math.floor(s)), label: str(o.label) }
    })
    .filter(
      (x): x is { start_seconds: number; label: string } => x !== null,
    )
}

function coerceWebsiteSection(o: Record<string, unknown>): Partial<WebsiteSection> {
  return {
    final_title: str(o.final_title),
    subtitle: str(o.subtitle),
    slug: str(o.slug),
    canonical_description: str(o.canonical_description),
    episode_summary: str(o.episode_summary),
    key_takeaways: strArray(o.key_takeaways),
    quote_highlights: strArray(o.quote_highlights),
    emotional_keywords: strArray(o.emotional_keywords),
    topic_keywords: strArray(o.topic_keywords),
    resources: labelUrlArray(o.resources),
    guest_bio: str(o.guest_bio),
    guest_links: labelUrlArray(o.guest_links),
    timeline_sections: timestampArray(o.timeline_sections),
    faq: Array.isArray(o.faq)
      ? (o.faq as unknown[])
          .map((item) => {
            if (!item || typeof item !== "object") return null
            const r = item as Record<string, unknown>
            const q = str(r.q)
            const a = str(r.a)
            return q || a ? { q, a } : null
          })
          .filter((x): x is { q: string; a: string } => x !== null)
      : [],
    reading_time_estimate_minutes:
      typeof o.reading_time_estimate_minutes === "number"
        ? Math.max(0, Math.floor(o.reading_time_estimate_minutes))
        : null,
  }
}
function coerceYoutubeSection(o: Record<string, unknown>): Partial<YoutubeSection> {
  return {
    youtube_title: str(o.youtube_title),
    youtube_description: str(o.youtube_description),
    pinned_comment: str(o.pinned_comment),
    chapter_export: timestampArray(o.chapter_export),
    thumbnail_text_options: strArray(o.thumbnail_text_options),
    thumbnail_direction: str(o.thumbnail_direction),
    tags: strArray(o.tags),
    hook_opening_line: str(o.hook_opening_line),
  }
}
function coerceSocialSection(o: Record<string, unknown>): Partial<SocialSection> {
  return {
    instagram_caption: str(o.instagram_caption),
    x_thread: strArray(o.x_thread),
    linkedin_post: str(o.linkedin_post),
    tiktok_caption: str(o.tiktok_caption),
    reel_hook_lines: strArray(o.reel_hook_lines),
    carousel_slide_copy: strArray(o.carousel_slide_copy),
    social_ctas: strArray(o.social_ctas),
  }
}
function coerceNewsletterSection(
  o: Record<string, unknown>,
): Partial<NewsletterSection> {
  return {
    newsletter_subject: str(o.newsletter_subject),
    newsletter_preview: str(o.newsletter_preview),
    newsletter_body: str(o.newsletter_body),
    featured_quote: str(o.featured_quote),
    emotional_angle: str(o.emotional_angle),
  }
}
function coerceSeoSection(o: Record<string, unknown>): Partial<SeoSection> {
  return {
    meta_title: str(o.meta_title),
    meta_description: str(o.meta_description),
    og_title: str(o.og_title),
    og_description: str(o.og_description),
    schema_notes: str(o.schema_notes),
    search_intent: (SEARCH_INTENTS as readonly string[]).includes(
      o.search_intent as string,
    )
      ? (o.search_intent as SearchIntent)
      : "narrative",
    ranking_angle: str(o.ranking_angle),
  }
}
function coerceSponsorSection(
  o: Record<string, unknown>,
): Partial<SponsorSection> {
  return {
    sponsor_mentions: strArray(o.sponsor_mentions),
    sponsor_timestamps: timestampArray(o.sponsor_timestamps),
    sponsor_cta_copy: strArray(o.sponsor_cta_copy),
    compliance_notes: str(o.compliance_notes),
  }
}
function coerceAnalyticsSection(
  o: Record<string, unknown>,
): Partial<AnalyticsExpectation> {
  const numericKeys: Array<keyof AnalyticsExpectation> = [
    "expected_retention",
    "expected_clip_strength",
    "expected_discussion_level",
    "expected_shareability",
    "expected_controversy",
    "confidence",
  ]
  const out: Partial<AnalyticsExpectation> = {}
  for (const k of numericKeys) {
    const v = Number(o[k])
    if (Number.isFinite(v)) out[k] = Math.max(0, Math.min(100, Math.round(v)))
  }
  return out
}
function coerceReleaseSection(
  o: Record<string, unknown>,
): Partial<ReleaseStrategy> {
  return {
    release_priority: (RELEASE_PRIORITIES as readonly string[]).includes(
      o.release_priority as string,
    )
      ? (o.release_priority as ReleasePriority)
      : "normal",
    release_window:
      typeof o.release_window === "string" ? o.release_window : null,
    release_reason: str(o.release_reason),
    primary_platform: (PRIMARY_PLATFORMS as readonly string[]).includes(
      o.primary_platform as string,
    )
      ? (o.primary_platform as PrimaryPlatform)
      : "website",
    audience_target: str(o.audience_target),
    strategic_notes: str(o.strategic_notes),
  }
}

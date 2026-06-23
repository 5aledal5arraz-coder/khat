/**
 * Growth package — the copy-ready YouTube publishing & growth deliverable
 * (Studio redesign, Goal 1).
 *
 * One `GrowthPackage` is assembled per episode from a small set of focused
 * generators that SYNTHESIZE from the shared GlobalEpisodeIntelligence rather
 * than re-reading the transcript. It is persisted as a `studio_analysis_records`
 * row (kind=growth_package) and rendered in the Studio "Growth" tab where the
 * operator copies each asset and publishes manually (no YouTube OAuth).
 */

/** A visual thumbnail direction (not just text — mood/color/composition). */
export interface ThumbnailConcept {
  /** One-line concept name, e.g. "المواجهة" / "اللحظة الصادمة". */
  concept: string
  /** Overall mood/emotion the thumbnail should project. */
  mood: string
  /** Color direction, e.g. "أحمر ناري + أسود عالي التباين". */
  color_palette: string
  /** Composition / framing guidance. */
  composition: string
  /** The big on-thumbnail text (3-5 words, high punch). */
  focal_text: string
  /** A ready-to-use image-generation prompt (English, for image tools). */
  image_prompt: string
}

/** A recommended ad/sponsor read placement. */
export interface AdPlacement {
  /** pre_roll | mid_roll | post_roll */
  type: "pre_roll" | "mid_roll" | "post_roll"
  /** Human position label tied to a topic boundary, not a raw timestamp. */
  position_label: string
  /** Approximate timestamp HH:MM:SS when derivable from chapters, else null. */
  approx_timestamp: string | null
  /** Why this is a natural, non-disruptive break. */
  why: string
}

/** Best-time-to-publish recommendation. */
export interface PublishTiming {
  day: string
  time_window: string
  timezone: string
  rationale: string
  alternatives: string[]
}

/** An audience-retention recommendation tied to a risk point. */
export interface RetentionRec {
  /** Where attention is at risk (from intelligence.retention_risk_points). */
  risk_point: string
  /** Concrete editing/packaging action to keep viewers. */
  recommendation: string
}

/** A per-platform social post (copy-ready caption + hashtags). */
export interface SocialPost {
  /** youtube_community | x | instagram | linkedin | tiktok | facebook */
  platform: string
  /** The full caption text, ready to paste. */
  caption: string
  hashtags: string[]
}

/** A short-form (Reel/Short) idea distinct from the long-form clips. */
export interface ShortFormIdea {
  title: string
  /** The angle/hook that makes it work standalone. */
  angle: string
  /** The source moment in the episode it draws from. */
  source_moment: string
  /** Target platforms. */
  platforms: string[]
}

/** Overall marketing strategy — the synthesis layer (runs last). */
export interface MarketingStrategy {
  summary: string
  positioning: string
  target_audience: string
  /** Ordered, do-this-next checklist for the operator. */
  priority_actions: string[]
}

export interface GrowthPackage {
  // ── Packaging / CTR ───────────────────────────────────────────────
  thumbnail_concepts: ThumbnailConcept[]
  opening_hook: {
    hook_script: string
    rationale: string
    alt_hooks: string[]
  } | null

  // ── Distribution / timing ─────────────────────────────────────────
  sponsor_placements: AdPlacement[]
  best_publish_time: PublishTiming | null
  retention_recommendations: RetentionRec[]

  // ── Social / short-form ───────────────────────────────────────────
  social_posts: SocialPost[]
  short_form_ideas: ShortFormIdea[]

  // ── Attention angles (surfaced from intelligence) ─────────────────
  controversy_angles: string[]

  // ── Synthesis ─────────────────────────────────────────────────────
  marketing_strategy: MarketingStrategy | null

  /** Per-slice generation provenance for telemetry/debugging. */
  meta?: {
    generated_at?: string
    run_ids?: Record<string, string | undefined>
    errors?: Record<string, string>
  }
}

/** Empty package — used as the assembly seed. */
export function emptyGrowthPackage(): GrowthPackage {
  return {
    thumbnail_concepts: [],
    opening_hook: null,
    sponsor_placements: [],
    best_publish_time: null,
    retention_recommendations: [],
    social_posts: [],
    short_form_ideas: [],
    controversy_angles: [],
    marketing_strategy: null,
  }
}

/**
 * Arabic-podcast corpus — the raw material for editorial intelligence.
 *
 * One row per episode across the shows Khat studies (competitors) + Khat's own
 * catalogue. Metadata first (title/description/views/date); transcripts of top
 * performers land later (Phase B2). Downstream (Phase B3) derives living themes,
 * a resonance model, and a saturation ↔ white-space map from these rows so the
 * topic engines' "novelty" + "boldness" are grounded in what actually resonated
 * — not just the model's priors.
 *
 * Sources are config-driven (lib/corpus/sources.ts) so adding a podcast is a
 * one-line change; `source_slug` ties a row back to its source.
 */

import { pgTable, text, integer, bigint, real, boolean, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core"

/**
 * Living themes derived from the corpus (Phase B3). A projection recomputed from
 * corpus_episodes, NOT hand-authored state — so it evolves as the corpus grows.
 * Each theme carries the resonance / saturation / white-space signals the topic
 * engines consume (B4) and the Living Knowledge Universe evolves from (Phase C).
 */
export const corpusThemes = pgTable(
  "corpus_themes",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    /** Stable slug for the theme (kebab), for joins + episode assignment. */
    slug: text("slug").notNull().unique(),
    label_ar: text("label_ar").notNull(),
    description_ar: text("description_ar"),
    /** Representative example titles (for the brief + operator review). */
    example_titles: jsonb("example_titles").$type<string[]>().default([]),
    keywords: jsonb("keywords").$type<string[]>().default([]),
    /** Cluster centroid (for assigning new episodes without re-clustering). */
    centroid: jsonb("centroid").$type<number[]>(),

    // ─── Signals ────────────────────────────────────────────────────────────────
    episode_count: integer("episode_count").notNull().default(0),
    /** Distinct competitor sources covering this theme (breadth). */
    source_count: integer("source_count").notNull().default(0),
    /** How many of Khat's own episodes fall in this theme. */
    khat_count: integer("khat_count").notNull().default(0),
    /** Mean engagement_index of episodes in this theme (resonance, >1 = over-performs). */
    mean_engagement: real("mean_engagement"),
    median_engagement: real("median_engagement"),
    /** 0-1 how much this theme over-performs across the ecosystem. */
    resonance_score: real("resonance_score"),
    /** 0-1 how saturated (many episodes across many shows). */
    saturation_score: real("saturation_score"),
    /** High resonance + low coverage (or a Khat gap) — an opportunity. */
    is_white_space: boolean("is_white_space").notNull().default(false),

    computed_at: timestamp("computed_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_corpus_themes_resonance").on(t.resonance_score),
    index("idx_corpus_themes_whitespace").on(t.is_white_space),
  ],
)

export const corpusEpisodes = pgTable(
  "corpus_episodes",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    /** Which source produced this episode — matches a slug in lib/corpus/sources.ts. */
    source_slug: text("source_slug").notNull(),
    /** True for Khat's own episodes (kept in the same corpus for lane analysis). */
    is_khat: boolean("is_khat").notNull().default(false),
    platform: text("platform").notNull().default("youtube"),
    /** Platform id (YouTube video id) — unique per (source, external_id). */
    external_id: text("external_id").notNull(),
    channel_id: text("channel_id"),

    title: text("title").notNull(),
    description: text("description"),
    published_at: timestamp("published_at", { withTimezone: true }),
    duration_seconds: integer("duration_seconds"),

    // ─── Engagement ────────────────────────────────────────────────────────────
    view_count: bigint("view_count", { mode: "number" }),
    like_count: integer("like_count"),
    comment_count: integer("comment_count"),
    /**
     * Views relative to this source's own median (computed at analysis time and
     * cached here): 1.0 = a typical episode for that show, >1 = over-performed.
     * Lets us compare a small show and a huge show on the same footing.
     */
    engagement_index: real("engagement_index"),

    // ─── Depth (Phase B2) ────────────────────────────────────────────────────────
    /** Full transcript for top performers; null until transcribed. */
    transcript: text("transcript"),
    transcribed_at: timestamp("transcribed_at", { withTimezone: true }),

    // ─── Derived editorial intelligence (Phase B3) ──────────────────────────────
    /** Living-theme labels this episode clusters into. */
    themes: jsonb("themes").$type<string[]>().default([]),
    /** Episode SHAPE (shared archetype vocabulary), inferred from title/description. */
    archetype: text("archetype"),
    /** Extra extracted signals (angle, hooks, guest-kind, …). */
    extracted: jsonb("extracted").$type<Record<string, unknown>>(),
    embedding: jsonb("embedding").$type<number[]>(),
    analyzed_at: timestamp("analyzed_at", { withTimezone: true }),

    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_corpus_source_external").on(t.source_slug, t.external_id),
    index("idx_corpus_source").on(t.source_slug),
    index("idx_corpus_engagement").on(t.engagement_index),
    index("idx_corpus_published").on(t.published_at),
  ],
)

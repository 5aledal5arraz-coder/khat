import { pgTable, text, integer, boolean, date, timestamp, jsonb } from "drizzle-orm/pg-core"
import { guests } from "./guests"

export const episodeCategories = pgTable("episode_categories", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  sort_order: integer("sort_order").default(0),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

export const episodes = pgTable("episodes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  slug: text("slug").unique().notNull(),
  description: text("description"),
  summary: text("summary"),
  key_takeaways: jsonb("key_takeaways").$type<string[]>(),
  youtube_url: text("youtube_url").notNull(),
  duration_minutes: integer("duration_minutes").notNull().default(0),
  release_date: date("release_date").notNull(),
  episode_number: integer("episode_number"),
  season: integer("season"),
  mood: text("mood"),
  thumbnail_url: text("thumbnail_url"),
  status: text("status").default("published"),
  featured: boolean("featured").default(false),
  view_count: integer("view_count").default(0),
  category_id: text("category_id").references(() => episodeCategories.id, { onDelete: "set null" }),
  guest_id: text("guest_id").references(() => guests.id, { onDelete: "set null" }),
  guest_testimonial: text("guest_testimonial"),
  guest_video_url: text("guest_video_url"),
  audio_url: text("audio_url"),
  audio_type: text("audio_type"),
  rss_guid: text("rss_guid").unique(),
  rss_published_at: timestamp("rss_published_at", { withTimezone: true }),
  audio_duration: integer("audio_duration"),
  /**
   * Khat Brain — link to the master Episode Intelligence Record.
   * Stamped when a studio session is pushed to the episode (Phase 3).
   * No Drizzle .references() to avoid circular imports; FK installed
   * by the migration.
   */
  eir_id: text("eir_id"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

export const timestamps = pgTable("timestamps", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  episode_id: text("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  time_seconds: integer("time_seconds").notNull(),
  title: text("title").notNull(),
  description: text("description"),
})

export const quotes = pgTable("quotes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  episode_id: text("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  guest_id: text("guest_id").references(() => guests.id, { onDelete: "set null" }),
  text: text("text").notNull(),
  theme: text("theme"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

export const resources = pgTable("resources", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  episode_id: text("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  url: text("url").notNull(),
  type: text("type"),
})

export const episodeVersions = pgTable("episode_versions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  episode_id: text("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  version_number: integer("version_number").notNull(),
  change_type: text("change_type").notNull(),
  change_summary: text("change_summary"),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>(),
  created_by: text("created_by").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

export const episodeOverrides = pgTable("episode_overrides", {
  episode_id: text("episode_id").primaryKey(),
  original_title: text("original_title").notNull(),
  custom_title: text("custom_title").notNull(),
  custom_description: text("custom_description"),
})

export const episodeEnrichments = pgTable("episode_enrichments", {
  episode_id: text("episode_id").primaryKey(),
  hero_summary: text("hero_summary"),
  full_summary: text("full_summary"),
  takeaways: jsonb("takeaways").$type<string[]>(),
  resources: jsonb("resources").$type<unknown[]>(),
  timestamps: jsonb("timestamps").$type<unknown[]>(),
  why_this_conversation: text("why_this_conversation"),
  before_you_watch: jsonb("before_you_watch").$type<unknown>(),
  conversation_map: jsonb("conversation_map").$type<unknown>(),
  central_question: text("central_question"),
  exclusive_clip: jsonb("exclusive_clip").$type<unknown>(),
  unsaid_reflections: jsonb("unsaid_reflections").$type<string[]>(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})


// episode_guest_assignments removed in Khat Brain Phase 1 — guest-episode
// linking lives on episodes.guest_id. The migration drops the table.

export const episodeQuotesConfig = pgTable("episode_quotes_config", {
  episode_id: text("episode_id").primaryKey(),
  episode_title: text("episode_title").notNull(),
  quotes: jsonb("quotes").$type<unknown[]>().notNull(),
  transcript: text("transcript"),
  status: text("status").default("draft"),
  generated_at: text("generated_at"),
  published_at: text("published_at"),
})

export const episodeSponsors = pgTable("episode_sponsors", {
  episode_id: text("episode_id").primaryKey().references(() => episodes.id, { onDelete: "cascade" }),
  partner_id: text("partner_id").notNull(),
  custom_brand_line: text("custom_brand_line"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

export const hiddenEpisodes = pgTable("hidden_episodes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  episode_id: text("episode_id").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

/**
 * Tombstone table for hard-deleted episodes.
 *
 * Because episodes can come from an external source (YouTube) that we do
 * not control, simply deleting a row from `episodes` is not enough — the
 * next refresh will pull the episode back in and `mergeEpisodeLists` will
 * re-inject it. Rows in this table are ALWAYS filtered out of any episode
 * list (regardless of `includeHidden`) so deletions are permanent.
 */
export const deletedEpisodes = pgTable("deleted_episodes", {
  episode_id: text("episode_id").primaryKey(),
  deleted_at: timestamp("deleted_at", { withTimezone: true }).defaultNow(),
  deleted_by: text("deleted_by"),
})

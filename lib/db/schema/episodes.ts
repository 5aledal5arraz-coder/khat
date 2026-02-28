import { pgTable, text, integer, boolean, date, timestamp, jsonb, primaryKey } from "drizzle-orm/pg-core"
import { guests } from "./guests"
import { topics } from "./topics"

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
  guest_id: text("guest_id").references(() => guests.id, { onDelete: "set null" }),
  guest_testimonial: text("guest_testimonial"),
  guest_video_url: text("guest_video_url"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

export const episodeTopics = pgTable("episode_topics", {
  episode_id: text("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  topic_id: text("topic_id").notNull().references(() => topics.id, { onDelete: "cascade" }),
}, (t) => [
  primaryKey({ columns: [t.episode_id, t.topic_id] }),
])

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
  topics: jsonb("topics").$type<string[]>(),
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

export const episodeSections = pgTable("episode_sections", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  order: integer("order").notNull(),
  color: text("color"),
  hidden: boolean("hidden").default(false),
})

export const episodeSectionAssignments = pgTable("episode_section_assignments", {
  episode_id: text("episode_id").primaryKey(),
  section_id: text("section_id").notNull().references(() => episodeSections.id, { onDelete: "cascade" }),
})

export const episodeVisibility = pgTable("episode_visibility", {
  episode_id: text("episode_id").primaryKey(),
  visibility: text("visibility").notNull(),
})

export const episodeGuestAssignments = pgTable("episode_guest_assignments", {
  episode_id: text("episode_id").primaryKey(),
  guest_id: text("guest_id").notNull().references(() => guests.id, { onDelete: "cascade" }),
})

export const episodeQuotesConfig = pgTable("episode_quotes_config", {
  episode_id: text("episode_id").primaryKey(),
  episode_title: text("episode_title").notNull(),
  quotes: jsonb("quotes").$type<unknown[]>().notNull(),
  transcript: text("transcript"),
  status: text("status").default("draft"),
  generated_at: text("generated_at"),
  published_at: text("published_at"),
})

export const episodeKnowledge = pgTable("episode_knowledge", {
  episode_id: text("episode_id").primaryKey(),
  analysis: jsonb("analysis").$type<Record<string, unknown>>().notNull(),
})

export const episodeKnowledgeMeta = pgTable("episode_knowledge_meta", {
  key: text("key").primaryKey(),
  topic_taxonomy: jsonb("topic_taxonomy").$type<unknown[]>(),
  relationships: jsonb("relationships").$type<Record<string, string[]>>(),
  analyzed_at: text("analyzed_at"),
  season_1_count: integer("season_1_count").default(0),
  season_2_count: integer("season_2_count").default(0),
})

export const hiddenEpisodes = pgTable("hidden_episodes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  episode_id: text("episode_id").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

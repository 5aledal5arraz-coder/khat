import { pgTable, text, integer, timestamp, uuid, jsonb } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const studioSessions = pgTable("studio_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  youtube_url: text("youtube_url"),
  video_id: text("video_id"),
  source: text("source"),
  status: text("status").default("draft"),
  video_title: text("video_title"),
  channel_title: text("channel_title"),
  published_at: timestamp("published_at", { withTimezone: true }),
  duration_seconds: integer("duration_seconds"),
  thumbnail_url: text("thumbnail_url"),
  raw_youtube_response: jsonb("raw_youtube_response").$type<Record<string, unknown>>(),
  audio_filename: text("audio_filename"),
  audio_file_size: integer("audio_file_size"),
  audio_start_seconds: integer("audio_start_seconds"),
  audio_end_seconds: integer("audio_end_seconds"),
  audio_best_intro: text("audio_best_intro"),
  audio_edit_suggestions: jsonb("audio_edit_suggestions").$type<unknown[]>(),
  // Studio may store extra fields from different session types
  episode_id: text("episode_id"),
  episode_title: text("episode_title"),
  source_type: text("source_type"),
  notes: text("notes"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

export const studioTranscripts = pgTable("studio_transcripts", {
  id: uuid("id").primaryKey().defaultRandom(),
  session_id: uuid("session_id").notNull().references(() => studioSessions.id, { onDelete: "cascade" }),
  source: text("source").default("youtube_captions"),
  language: text("language").default("ar"),
  transcript_raw: text("transcript_raw").default(""),
  transcript_clean: text("transcript_clean").default(""),
  word_count: integer("word_count").default(0),
  char_count: integer("char_count").default(0),
  status: text("status").default("ready"),
  error_message: text("error_message"),
  transcript_article: text("transcript_article"),
  summary: jsonb("summary").$type<{ overview: string; key_ideas: string[]; lessons: string[] }>(),
  quotes_extracted: jsonb("quotes_extracted").$type<{ text: string; theme: string }[]>(),
  processing_status: text("processing_status").default("idle"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

export const studioAiOutputs = pgTable("studio_ai_outputs", {
  id: uuid("id").primaryKey().defaultRandom(),
  session_id: uuid("session_id").notNull().references(() => studioSessions.id, { onDelete: "cascade" }),
  model: text("model").default("gpt-4o-mini"),
  prompt_version: text("prompt_version").default("v1"),
  status: text("status").default("generating"),
  title_best: text("title_best").default(""),
  title_alternatives: jsonb("title_alternatives").$type<string[]>().default(sql`'[]'::jsonb`),
  thumbnail_text_options: jsonb("thumbnail_text_options").$type<string[]>().default(sql`'[]'::jsonb`),
  youtube_description: text("youtube_description").default(""),
  seo_keywords: jsonb("seo_keywords").$type<string[]>().default(sql`'[]'::jsonb`),
  hashtags: jsonb("hashtags").$type<string[]>().default(sql`'[]'::jsonb`),
  raw_openai_response: jsonb("raw_openai_response").$type<Record<string, unknown>>(),
  error_message: text("error_message"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

export const studioChapters = pgTable("studio_chapters", {
  id: uuid("id").primaryKey().defaultRandom(),
  session_id: uuid("session_id").notNull().references(() => studioSessions.id, { onDelete: "cascade" }),
  status: text("status").default("generating"),
  chapters: jsonb("chapters").$type<{ start_time: string; title: string }[]>().default(sql`'[]'::jsonb`),
  raw_openai_response: jsonb("raw_openai_response").$type<Record<string, unknown>>(),
  error_message: text("error_message"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

export const studioClips = pgTable("studio_clips", {
  id: uuid("id").primaryKey().defaultRandom(),
  session_id: uuid("session_id").notNull().references(() => studioSessions.id, { onDelete: "cascade" }),
  status: text("status").default("generating"),
  clips: jsonb("clips").$type<unknown[]>().default(sql`'[]'::jsonb`),
  raw_openai_response: jsonb("raw_openai_response").$type<Record<string, unknown>>(),
  error_message: text("error_message"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

export const studioWebsitePackages = pgTable("studio_website_packages", {
  id: uuid("id").primaryKey().defaultRandom(),
  session_id: uuid("session_id").notNull().references(() => studioSessions.id, { onDelete: "cascade" }),
  status: text("status").default("generating"),
  hero_summary: text("hero_summary"),
  full_summary: text("full_summary"),
  takeaways: text("takeaways").array().default(sql`'{}'::text[]`),
  quotes: jsonb("quotes").$type<{ text: string; theme: string | null; speaker?: string | null }[]>().default(sql`'[]'::jsonb`),
  topics: text("topics").array().default(sql`'{}'::text[]`),
  resources: jsonb("resources").$type<{ title: string; url: string; type: string | null }[]>().default(sql`'[]'::jsonb`),
  timestamps: jsonb("timestamps").$type<{ time_seconds: number; title: string; description: string | null }[]>().default(sql`'[]'::jsonb`),
  custom_title: text("custom_title"),
  selected_quote_indices: jsonb("selected_quote_indices").$type<number[]>(),
  selected_takeaway_indices: jsonb("selected_takeaway_indices").$type<number[]>(),
  linked_episode_id: text("linked_episode_id"),
  guest_package: jsonb("guest_package").$type<{ guest_name: string; guest_bio: string; guest_photo_url: string | null; guest_external_links: Record<string, string> }>(),
  raw_openai_response: jsonb("raw_openai_response").$type<Record<string, unknown>>(),
  error_message: text("error_message"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

export const studioAnalyzers = pgTable("studio_analyzers", {
  id: uuid("id").primaryKey().defaultRandom(),
  session_id: uuid("session_id").notNull().references(() => studioSessions.id, { onDelete: "cascade" }),
  status: text("status").default("idle"),
  data: jsonb("data").$type<Record<string, unknown>>(),
  prompt_version: text("prompt_version").default("v1"),
  raw_openai_response: jsonb("raw_openai_response").$type<Record<string, unknown>>(),
  error_message: text("error_message"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

export const studioPushLog = pgTable("studio_push_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  session_id: uuid("session_id").notNull().references(() => studioSessions.id, { onDelete: "cascade" }),
  episode_id: text("episode_id"),
  episode_title: text("episode_title"),
  pushed_fields: text("pushed_fields").array(),
  pushed_at: timestamp("pushed_at", { withTimezone: true }).defaultNow(),
})

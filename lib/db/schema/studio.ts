/**
 * Studio sessions schema.
 *
 * Khat Brain Phase 5: the 9 legacy `studio_*` output tables (transcripts,
 * ai_outputs, chapters, clips, website_packages, analyzers, deep_analysis,
 * guest_intelligence, push_log) have been dropped. All Studio outputs
 * now live in `studio_analysis_records` (see `./studio-analysis.ts`),
 * keyed on `studio_session_id` + `kind`.
 *
 * `studio_sessions` itself remains — it's the source-of-truth row for
 * a recording session (YouTube URL, audio file, episode link, EIR link).
 */

import { pgTable, text, integer, timestamp, uuid, jsonb } from "drizzle-orm/pg-core"

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
  // Cross-references kept for backward compat; new code reads from
  // studio_analysis_records or follows the EIR spine.
  episode_id: text("episode_id"),
  episode_title: text("episode_title"),
  source_type: text("source_type"),
  notes: text("notes"),
  /**
   * Khat Brain — link to the master EIR. Stamped when a studio session
   * is created from a preparation (or an episode that already has an
   * EIR). For YouTube/upload-imported sessions without provenance, a
   * fresh EIR is minted at phase=producing or published.
   */
  eir_id: text("eir_id"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

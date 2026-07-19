import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core"
import { guests } from "./guests"
import { episodeIntelligenceRecords } from "./eir"

export const homeQuotes = pgTable("home_quotes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  text: text("text").notNull(),
  attribution: text("attribution").notNull(),
  episode_id: text("episode_id"),
  episode_slug: text("episode_slug"),
  episode_title: text("episode_title"),
  theme: text("theme"),
  scheduled_date: text("scheduled_date"), // YYYY-MM-DD
  status: text("status").default("draft"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})


export const dailyReflections = pgTable("daily_reflections", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  date: text("date").notNull(), // YYYY-MM-DD
  short_quote: text("short_quote").notNull(),
  reflection: text("reflection").notNull(),
  thinking_question: text("thinking_question").notNull(),
  attribution: text("attribution"),
  episode_id: text("episode_id"),
  episode_slug: text("episode_slug"),
  episode_title: text("episode_title"),
  status: text("status").default("draft"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

export const teasers = pgTable("teasers", {
  id: text("id").primaryKey(),
  // v1 links a teaser to an UPCOMING episode (an EIR before it is published)
  // and to that episode's guest. Both are nullable FKs, set null on delete so
  // an orphaned teaser survives (and can be cleaned up by an admin) rather
  // than cascading. `eir_id` → episode_intelligence_records (the pipeline
  // record that carries phase/title/guest); after publish, episodes.eir_id
  // bridges to the public episode for the archive display.
  eir_id: text("eir_id").references(() => episodeIntelligenceRecords.id, { onDelete: "set null" }),
  guest_id: text("guest_id").references(() => guests.id, { onDelete: "set null" }),
  // Legacy free-text guest name. Kept for back-compat but now nullable — the
  // canonical guest comes from `guest_id`/the linked EIR, and an EIR before
  // guest_assigned has no guest yet.
  guest_name: text("guest_name"),
  title: text("title").notNull(),
  prompt: text("prompt").notNull(),
  video_filename: text("video_filename").notNull(),
  poster_image: text("poster_image"),
  is_active: boolean("is_active").default(false),
  publish_at: text("publish_at"),
  expire_at: text("expire_at"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

export const homepageFeatured = pgTable("homepage_featured", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  position: integer("position").notNull(), // 1, 2, or 3
  episode_id: text("episode_id").notNull(),
  custom_quote: text("custom_quote"),
  custom_description: text("custom_description"),
  custom_image: text("custom_image"),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

export const homepageThinkers = pgTable("homepage_thinkers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  position: integer("position").notNull(),
  guest_id: text("guest_id").notNull(),
  custom_title: text("custom_title"),
  custom_description: text("custom_description"),
  custom_image: text("custom_image"),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

export const homepageSettings = pgTable("homepage_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

// thinker_suggestions retired June 2026 — its "suggest a guest" purpose was
// absorbed by the community contribution hub (lib/db/schema/community.ts,
// type = "guest"). The legacy table is dropped in scripts/post-schema.sql.

// NOTE: the public questions feature is OUT OF SCOPE for teaser v1 (it stays
// dormant). These columns only repair the Drizzle-migration drift from
// 2026-02-20 so the schema is internally consistent and the insert path is no
// longer broken: `user_agent` was dropped but the insert still referenced it,
// and `display_name` was made NOT NULL although anonymous submissions are
// allowed. A DB-level default for `id` is added in post-schema.sql as a
// defence-in-depth layer for any raw insert.
export const teaserQuestions = pgTable("teaser_questions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  teaser_id: text("teaser_id").notNull().references(() => teasers.id, { onDelete: "cascade" }),
  display_name: text("display_name"),
  question_text: text("question_text").notNull(),
  status: text("status").default("pending"),
  ip_hash: text("ip_hash"),
  user_agent: text("user_agent"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

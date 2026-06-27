import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core"

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
  guest_name: text("guest_name").notNull(),
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

export const teaserQuestions = pgTable("teaser_questions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  teaser_id: text("teaser_id").notNull().references(() => teasers.id, { onDelete: "cascade" }),
  display_name: text("display_name").notNull(),
  question_text: text("question_text").notNull(),
  status: text("status").default("pending"),
  ip_hash: text("ip_hash"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

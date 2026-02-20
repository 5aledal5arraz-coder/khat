import { pgTable, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

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

export const emotionalPaths = pgTable("emotional_paths", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  slug: text("slug").unique().notNull(),
  title: text("title").notNull(),
  subtitle: text("subtitle").notNull(),
  icon: text("icon").notNull(),
  color: text("color").notNull(),
  episode_ids: jsonb("episode_ids").$type<string[]>().default(sql`'[]'::jsonb`),
  quote_ids: jsonb("quote_ids").$type<string[]>().default(sql`'[]'::jsonb`),
  order: integer("order").notNull(),
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

export const teaserQuestions = pgTable("teaser_questions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  teaser_id: text("teaser_id").notNull().references(() => teasers.id, { onDelete: "cascade" }),
  display_name: text("display_name").notNull(),
  question_text: text("question_text").notNull(),
  status: text("status").default("pending"),
  ip_hash: text("ip_hash"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

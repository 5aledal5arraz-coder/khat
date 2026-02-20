import { pgTable, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core"

export const guests = pgTable("guests", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  bio: text("bio"),
  photo_url: text("photo_url"),
  external_links: jsonb("external_links").$type<Record<string, string>>().default({}),
  testimonial: text("testimonial"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

export const guestApplications = pgTable("guest_applications", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  country: text("country").notNull(),
  can_travel_to_kuwait: text("can_travel_to_kuwait"),
  story_idea: text("story_idea").notNull(),
  beyond_job_title: text("beyond_job_title").notNull(),
  life_changing_moment: text("life_changing_moment").notNull(),
  hope_people_understand: text("hope_people_understand").notNull(),
  unasked_question: text("unasked_question").notNull(),
  why_khat: text("why_khat").notNull(),
  previous_podcast: boolean("previous_podcast").default(false),
  previous_podcast_info: text("previous_podcast_info"),
  prefer_dialogue_or_story: text("prefer_dialogue_or_story").notNull(),
  topics_to_avoid: text("topics_to_avoid"),
  filming_concern: text("filming_concern").default("no"),
  agrees_to_publish: boolean("agrees_to_publish").default(true),
  social_links: text("social_links"),
  status: text("status").default("new"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

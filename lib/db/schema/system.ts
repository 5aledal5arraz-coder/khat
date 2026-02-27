import { pgTable, text, integer, boolean, timestamp, uuid, jsonb, unique } from "drizzle-orm/pg-core"
import { profiles } from "./community"

export const newsletterSubscribers = pgTable("newsletter_subscribers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text("email").unique().notNull(),
  status: text("status").default("active"),
  unsubscribe_token: text("unsubscribe_token").unique(),
  unsubscribed_at: timestamp("unsubscribed_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

export const sponsorshipLeads = pgTable("sponsorship_leads", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  company_name: text("company_name").notNull(),
  industry: text("industry").notNull(),
  contact_name: text("contact_name").notNull(),
  job_title: text("job_title").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  collaboration_types: text("collaboration_types").array().default([]),
  collaboration_other: text("collaboration_other"),
  main_goal: text("main_goal").notNull(),
  target_audience: text("target_audience").notNull(),
  preferred_timeline: text("preferred_timeline"),
  budget_range: text("budget_range").notNull(),
  additional_info: text("additional_info"),
  status: text("status").default("new"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

export const rateLimits = pgTable("rate_limits", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

export const configStore = pgTable("config_store", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

export const siteSettings = pgTable("site_settings", {
  key: text("key").primaryKey(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  social_links: jsonb("social_links").$type<unknown[]>(),
  seo: jsonb("seo").$type<Record<string, unknown>>(),
  feature_flags: jsonb("feature_flags").$type<Record<string, boolean>>(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

export const staticContent = pgTable("static_content", {
  key: text("key").primaryKey(),
  content: jsonb("content").$type<unknown>(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

export const analyticsEvents = pgTable("analytics_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  visitor_id: text("visitor_id"),
  event_type: text("event_type").notNull(),
  event_data: jsonb("event_data").$type<Record<string, unknown>>(),
  page_path: text("page_path"),
  referrer: text("referrer"),
  user_agent: text("user_agent"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

export const personalizationProfiles = pgTable("personalization_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  visitor_id: text("visitor_id").unique().notNull(),
  data: jsonb("data").$type<Record<string, unknown>>(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

export const watchHistory = pgTable("watch_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  visitor_id: text("visitor_id").notNull(),
  episode_id: text("episode_id").notNull(),
  progress: integer("progress").default(0),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

// newsletterSends removed — replaced by newsletterCampaigns in ./newsletter.ts

export const emailNotificationsLog = pgTable("email_notifications_log", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  recipient_id: text("recipient_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  notification_type: text("notification_type").notNull(),
  trigger_user_id: text("trigger_user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  target_id: text("target_id").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  unique().on(t.recipient_id, t.notification_type, t.trigger_user_id, t.target_id),
])

export const platformAnalytics = pgTable("platform_analytics", {
  platform: text("platform").primaryKey(),
  followers: integer("followers").default(0),
  posts: integer("posts").default(0),
  engagement: text("engagement").default("0%"),
  url: text("url").default(""),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

export const visitorEvents = pgTable("visitor_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  visitor_id: text("visitor_id").notNull(),
  event_type: text("event_type").notNull(),
  target_id: text("target_id").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

export const visitorProfiles = pgTable("visitor_profiles", {
  visitor_id: text("visitor_id").primaryKey(),
  interest_vector: jsonb("interest_vector").$type<Record<string, number>>().notNull(),
  last_updated: text("last_updated"),
  event_count_at_build: integer("event_count_at_build").default(0),
})

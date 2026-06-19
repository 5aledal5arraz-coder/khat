import { pgTable, text, integer, timestamp, unique } from "drizzle-orm/pg-core"
import { newsletterSubscribers } from "./system"

export const newsletterCampaigns = pgTable("newsletter_campaigns", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  type: text("type").notNull().default("one_off"),
  subject: text("subject").notNull(),
  preview_text: text("preview_text"),
  content_html: text("content_html").notNull(),
  status: text("status").notNull().default("draft"),
  scheduled_at: timestamp("scheduled_at", { withTimezone: true }),
  sent_at: timestamp("sent_at", { withTimezone: true }),
  sent_by: text("sent_by"),
  total_recipients: integer("total_recipients").default(0),
  total_sent: integer("total_sent").default(0),
  total_failed: integer("total_failed").default(0),
  total_delivered: integer("total_delivered").default(0),
  total_opened: integer("total_opened").default(0),
  total_clicked: integer("total_clicked").default(0),
  total_bounced: integer("total_bounced").default(0),
  total_complaints: integer("total_complaints").default(0),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

export const newsletterDeliveries = pgTable("newsletter_deliveries", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  campaign_id: text("campaign_id").notNull().references(() => newsletterCampaigns.id, { onDelete: "cascade" }),
  subscriber_id: text("subscriber_id").notNull().references(() => newsletterSubscribers.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("queued"),
  resend_message_id: text("resend_message_id"),
  error: text("error"),
  sent_at: timestamp("sent_at", { withTimezone: true }),
  last_event_at: timestamp("last_event_at", { withTimezone: true }),
  open_count: integer("open_count").default(0),
  first_opened_at: timestamp("first_opened_at", { withTimezone: true }),
  last_opened_at: timestamp("last_opened_at", { withTimezone: true }),
  click_count: integer("click_count").default(0),
  first_clicked_at: timestamp("first_clicked_at", { withTimezone: true }),
  last_clicked_at: timestamp("last_clicked_at", { withTimezone: true }),
  // Resend webhook lifecycle (RFC: each stamped once → idempotent counters).
  delivered_at: timestamp("delivered_at", { withTimezone: true }),
  bounced_at: timestamp("bounced_at", { withTimezone: true }),
  bounce_type: text("bounce_type"),
  complained_at: timestamp("complained_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  unique().on(t.campaign_id, t.subscriber_id),
])

export const newsletterLinks = pgTable("newsletter_links", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  campaign_id: text("campaign_id").notNull().references(() => newsletterCampaigns.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  token: text("token").unique().notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  unique().on(t.campaign_id, t.url),
])

export const newsletterClicks = pgTable("newsletter_clicks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  link_id: text("link_id").notNull().references(() => newsletterLinks.id, { onDelete: "cascade" }),
  delivery_id: text("delivery_id").notNull().references(() => newsletterDeliveries.id, { onDelete: "cascade" }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

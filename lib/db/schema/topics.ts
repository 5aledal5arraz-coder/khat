import { pgTable, text, timestamp } from "drizzle-orm/pg-core"

// Used by episode_topics junction table
export const topics = pgTable("topics", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  description: text("description"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

// Full topic config used by admin topic management
export const topicsConfig = pgTable("topics_config", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  description: text("description"),
  color: text("color").notNull(),
  icon: text("icon"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

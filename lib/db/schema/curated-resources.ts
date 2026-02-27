import { pgTable, text, timestamp } from "drizzle-orm/pg-core"

export const curatedResources = pgTable("curated_resources", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  author: text("author"),
  description: text("description"),
  url: text("url"),
  type: text("type").notNull(),
  topic: text("topic"),
  ai_reasoning: text("ai_reasoning"),
  status: text("status").default("pending"),
  batch_id: text("batch_id"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  approved_at: timestamp("approved_at", { withTimezone: true }),
})

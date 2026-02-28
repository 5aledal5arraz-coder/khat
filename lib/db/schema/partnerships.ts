import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core"

export const trustedPartners = pgTable("trusted_partners", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  logo_url: text("logo_url"),
  website_url: text("website_url"),
  show_on_homepage: boolean("show_on_homepage").default(true),
  display_order: integer("display_order").default(0),
  is_active: boolean("is_active").default(true),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

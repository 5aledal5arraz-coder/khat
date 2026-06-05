import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core"
import { guestApplications } from "./guests"

export const guestPrepForms = pgTable("guest_prep_forms", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  application_id: text("application_id").notNull().references(() => guestApplications.id, { onDelete: "cascade" }).unique(),
  guest_name: text("guest_name").notNull(),
  guest_email: text("guest_email").notNull(),
  token_hash: text("token_hash").notNull().unique(),
  status: text("status").notNull().default("pending"),
  expires_at: timestamp("expires_at", { withTimezone: true }),
  response: jsonb("response").$type<Record<string, unknown>>(),
  submitted_at: timestamp("submitted_at", { withTimezone: true }),
  created_by: text("created_by").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

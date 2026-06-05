import { pgTable, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core"
import { sponsorshipLeads } from "./system"

export const sponsorshipAnalysis = pgTable("sponsorship_analysis", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lead_id: text("lead_id").notNull().references(() => sponsorshipLeads.id, { onDelete: "cascade" }).unique(),
  status: text("status").default("generating"),
  fit_score: integer("fit_score"),
  quality: text("quality"),
  risk_level: text("risk_level"),
  intent_summary: text("intent_summary"),
  budget_fit: text("budget_fit"),
  recommended_package: text("recommended_package"),
  reasoning: text("reasoning"),
  risk_flags: jsonb("risk_flags").$type<string[]>().default([]),
  opportunity_highlights: jsonb("opportunity_highlights").$type<string[]>().default([]),
  raw_response: jsonb("raw_response").$type<Record<string, unknown>>(),
  error_message: text("error_message"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

export const sponsorshipProposals = pgTable("sponsorship_proposals", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lead_id: text("lead_id").notNull().references(() => sponsorshipLeads.id, { onDelete: "cascade" }),
  analysis_id: text("analysis_id"),
  status: text("status").default("generating"),
  subject: text("subject"),
  greeting: text("greeting"),
  introduction: text("introduction"),
  value_proposition: text("value_proposition"),
  proposed_packages: jsonb("proposed_packages").$type<{ name: string; description: string; price_range: string; deliverables: string[] }[]>().default([]),
  next_steps: text("next_steps"),
  closing: text("closing"),
  full_draft: text("full_draft"),
  edited_draft: text("edited_draft"),
  tone: text("tone").default("formal"),
  raw_response: jsonb("raw_response").$type<Record<string, unknown>>(),
  error_message: text("error_message"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

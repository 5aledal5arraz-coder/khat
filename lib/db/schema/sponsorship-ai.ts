import { pgTable, text, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core"
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
  // ─── Partnership evaluation upgrade (live research + recommendations) ────────
  research_summary: text("research_summary"),
  research_sources: jsonb("research_sources").$type<{ title: string; url: string }[]>().default([]),
  reputation: text("reputation"),
  products_summary: text("products_summary"),
  market_position: text("market_position"),
  audience_summary: text("audience_summary"),
  fit_verdict: text("fit_verdict"),
  fit_reasoning: text("fit_reasoning"),
  recommended_structure: text("recommended_structure"),
  recommended_episodes: integer("recommended_episodes"),
  pricing_strategy: text("pricing_strategy"),
  researched_at: timestamp("researched_at", { withTimezone: true }),
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
  // A short, ready-to-send reply email introducing the proposal.
  reply_email: text("reply_email"),
  edited_draft: text("edited_draft"),
  tone: text("tone").default("formal"),
  raw_response: jsonb("raw_response").$type<Record<string, unknown>>(),
  error_message: text("error_message"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

/**
 * Per-company offer pages — an editable, password-protectable proposal published
 * at a secret link (/offer/<token>) and sent to a specific company. Seeded from
 * the AI proposal, then amended freely before publishing.
 */
export const partnershipOffers = pgTable("partnership_offers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lead_id: text("lead_id").notNull().references(() => sponsorshipLeads.id, { onDelete: "cascade" }),
  /** Unguessable secret slug used in the public URL. */
  token: text("token").notNull().unique(),
  title: text("title"),
  intro: text("intro"),
  /** The main offer body (seeded from the AI proposal draft; freely editable). */
  body: text("body"),
  packages: jsonb("packages").$type<{ name: string; description: string; price_range: string; deliverables: string[] }[]>().default([]),
  validity_note: text("validity_note"),
  contact_email: text("contact_email"),
  /** Optional bcrypt password gate on the public page. Null = link-only secrecy. */
  password_hash: text("password_hash"),
  published: boolean("published").notNull().default(false),
  view_count: integer("view_count").notNull().default(0),
  last_viewed_at: timestamp("last_viewed_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

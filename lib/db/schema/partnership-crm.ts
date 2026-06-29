/**
 * Partnership CRM — partner-specific relationship surfaces.
 *
 * A `sponsorship_leads` row IS the partner/company record. These tables hang
 * off it for the surfaces that are unique to partners: meetings, logged emails,
 * contracts, and campaigns with performance/ROI. All FK-cascade off the lead so
 * deleting a partner cleans up its whole history.
 *
 * The three universal CRM primitives — activity timeline, internal notes, and
 * tasks/reminders — are NOT here: they live on the shared polymorphic core
 * (`lib/db/schema/crm.ts`, keyed by subject_kind="partner", subject_id=lead_id).
 * `lib/partnership-crm/{activities,notes,tasks}.ts` are thin partner-scoped
 * adapters over `lib/crm/*`. Polymorphic rows can't FK-cascade, so the partner
 * delete path must call `deleteCrmForSubject("partner", leadId)`.
 */

import { pgTable, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core"
import { sponsorshipLeads } from "./system"

/** Meeting tracking — scheduled calls / videos / in-person, with outcomes. */
export const partnerMeetings = pgTable(
  "partner_meetings",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    lead_id: text("lead_id").notNull().references(() => sponsorshipLeads.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** call | video | in_person */
    type: text("type").notNull().default("call"),
    scheduled_at: timestamp("scheduled_at", { withTimezone: true }),
    duration_minutes: integer("duration_minutes"),
    attendees: text("attendees"),
    agenda: text("agenda"),
    notes: text("notes"),
    outcome: text("outcome"),
    /** scheduled | completed | cancelled */
    status: text("status").notNull().default("scheduled"),
    created_by: text("created_by"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("idx_partner_meetings_lead").on(t.lead_id)],
)

/** Email history — every message sent to (or logged from) a partner. */
export const partnerEmails = pgTable(
  "partner_emails",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    lead_id: text("lead_id").notNull().references(() => sponsorshipLeads.id, { onDelete: "cascade" }),
    /** outbound | inbound */
    direction: text("direction").notNull().default("outbound"),
    to_email: text("to_email"),
    from_email: text("from_email"),
    subject: text("subject"),
    body: text("body"),
    /** sent | failed | logged */
    status: text("status").notNull().default("sent"),
    provider_message_id: text("provider_message_id"),
    created_by: text("created_by"),
    sent_at: timestamp("sent_at", { withTimezone: true }).defaultNow(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("idx_partner_emails_lead").on(t.lead_id)],
)

/** Contract management — one active agreement per partner (history kept by row). */
export const partnerContracts = pgTable(
  "partner_contracts",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    lead_id: text("lead_id").notNull().references(() => sponsorshipLeads.id, { onDelete: "cascade" }),
    title: text("title"),
    /** draft | sent | signed | active | completed | expired | cancelled */
    status: text("status").notNull().default("draft"),
    value: integer("value"),
    currency: text("currency").notNull().default("KWD"),
    start_date: timestamp("start_date", { withTimezone: true }),
    end_date: timestamp("end_date", { withTimezone: true }),
    terms: text("terms"),
    document_url: text("document_url"),
    signed_at: timestamp("signed_at", { withTimezone: true }),
    notes: text("notes"),
    created_by: text("created_by"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("idx_partner_contracts_lead").on(t.lead_id)],
)

/** Campaign execution + post-campaign performance / ROI. */
export const partnerCampaigns = pgTable(
  "partner_campaigns",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    lead_id: text("lead_id").notNull().references(() => sponsorshipLeads.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** planned | live | completed | cancelled */
    status: text("status").notNull().default("planned"),
    episode_refs: jsonb("episode_refs").$type<string[]>().default([]),
    deliverables: jsonb("deliverables").$type<{ label: string; done: boolean }[]>().default([]),
    start_date: timestamp("start_date", { withTimezone: true }),
    end_date: timestamp("end_date", { withTimezone: true }),
    /** Free-form metric bag: impressions, downloads, clicks, leads, conversions, etc. */
    metrics: jsonb("metrics").$type<Record<string, number>>().default({}),
    roi_notes: text("roi_notes"),
    /** AI-generated post-campaign performance report. */
    performance_summary: text("performance_summary"),
    created_by: text("created_by"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("idx_partner_campaigns_lead").on(t.lead_id)],
)

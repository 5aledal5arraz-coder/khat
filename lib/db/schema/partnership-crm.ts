/**
 * Partnership CRM — the relationship spine.
 *
 * A `sponsorship_leads` row IS the partner/company record. These tables hang
 * off it to make it a full CRM: a timeline of every interaction, internal
 * notes, tasks/reminders, meetings, logged emails, contracts, and campaigns
 * with performance/ROI. All FK-cascade off the lead so deleting a partner
 * cleans up its whole history.
 */

import { pgTable, text, integer, timestamp, jsonb, boolean, index } from "drizzle-orm/pg-core"
import { sponsorshipLeads } from "./system"

/**
 * Unified per-partner activity timeline + audit log. Every meaningful event
 * (lead created, status changed, evaluation ran, note/task/meeting added,
 * email sent, offer published/viewed, contract/campaign updated) writes one
 * append-only row here. This is what powers the relationship history view.
 */
export const partnerActivities = pgTable(
  "partner_activities",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    lead_id: text("lead_id").notNull().references(() => sponsorshipLeads.id, { onDelete: "cascade" }),
    /**
     * Frozen vocab: lead_created | status_changed | evaluation_completed |
     * note_added | task_created | task_completed | meeting_logged |
     * email_sent | offer_published | offer_viewed | proposal_generated |
     * contract_updated | campaign_updated | owner_changed | report_generated
     */
    type: text("type").notNull(),
    summary: text("summary").notNull(),
    /** "admin:<email>" | "system:auto-triage" | "ai:director" | "public" */
    actor: text("actor"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("idx_partner_activities_lead").on(t.lead_id, t.created_at)],
)

/** Internal team notes on a partner — context the operator wants to remember. */
export const partnerNotes = pgTable(
  "partner_notes",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    lead_id: text("lead_id").notNull().references(() => sponsorshipLeads.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    author: text("author"),
    pinned: boolean("pinned").notNull().default(false),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("idx_partner_notes_lead").on(t.lead_id)],
)

/** Tasks / follow-up reminders. Can be created by an operator or by the AI Director. */
export const partnerTasks = pgTable(
  "partner_tasks",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    lead_id: text("lead_id").notNull().references(() => sponsorshipLeads.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    detail: text("detail"),
    /** follow_up | call | email | meeting | proposal | contract | custom */
    type: text("type").notNull().default("follow_up"),
    /** open | done | dismissed */
    status: text("status").notNull().default("open"),
    /** low | normal | high */
    priority: text("priority").notNull().default("normal"),
    due_at: timestamp("due_at", { withTimezone: true }),
    /** "admin:<email>" | "ai:director" */
    created_by: text("created_by"),
    completed_at: timestamp("completed_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_partner_tasks_lead").on(t.lead_id),
    index("idx_partner_tasks_due").on(t.status, t.due_at),
  ],
)

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

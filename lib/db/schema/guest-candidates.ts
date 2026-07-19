/**
 * Guest Candidates — standalone candidate management module.
 *
 * IMPORTANT: This schema is intentionally INDEPENDENT from `guests`,
 * `episodes`, and `studio_*` tables. There are no foreign keys to those
 * tables. Candidates are an internal admin pipeline for evaluating and
 * preparing potential guests; conversion to a real guest/episode is a
 * separate, explicit, manual decision.
 */

import {
  pgTable,
  text,
  boolean,
  timestamp,
  jsonb,
  integer,
  real,
  index,
} from "drizzle-orm/pg-core"

// ---------------------------------------------------------------------------
// 1. Candidates
// ---------------------------------------------------------------------------

export const guestCandidates = pgTable("guest_candidates", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

  // Identity
  full_name: text("full_name").notNull(),
  display_name: text("display_name"),
  slug: text("slug").unique(),

  // Profile
  primary_language: text("primary_language").default("ar"),
  category: text("category"), // business, media, philosophy, sports, ...
  city: text("city"),
  country: text("country"),
  // Direct contact channels — ADMIN-ONLY. Optional per-column, but the
  // admin candidate form requires at least one channel (phone / email /
  // social) on save. Fixated onto the canonical guest row at promotion
  // (lib/guests/canonical.ts → ensureGuest). Never surfaced publicly.
  phone: text("phone"),
  email: text("email"),
  bio: text("bio"),
  notes_internal: text("notes_internal"),

  // Lifecycle
  status: text("status").notNull().default("new"),
  source_type: text("source_type").default("manual"), // manual, ai_search, referral, social_discovery, other
  source_note: text("source_note"),
  priority_level: text("priority_level").default("medium"), // low, medium, high

  // AI Analysis (latest snapshot)
  ai_score_overall: real("ai_score_overall"),
  ai_fit_score: real("ai_fit_score"),
  ai_depth_score: real("ai_depth_score"),
  ai_reach_score: real("ai_reach_score"),
  ai_risk_score: real("ai_risk_score"),
  ai_summary: text("ai_summary"),
  ai_strengths: jsonb("ai_strengths").$type<string[]>().default([]),
  ai_weaknesses: jsonb("ai_weaknesses").$type<string[]>().default([]),
  ai_risk_notes: text("ai_risk_notes"),
  ai_topics_json: jsonb("ai_topics_json").$type<string[]>().default([]),
  ai_reason_to_invite: text("ai_reason_to_invite"),
  ai_conversation_angles_json: jsonb("ai_conversation_angles_json").$type<string[]>().default([]),
  ai_suggested_questions_json: jsonb("ai_suggested_questions_json").$type<{
    opening?: string[]
    deep?: string[]
    hard?: string[]
    emotional?: string[]
  }>().default({}),
  ai_model_used: text("ai_model_used"),
  ai_generated_at: timestamp("ai_generated_at", { withTimezone: true }),

  // Activity timestamps
  last_contacted_at: timestamp("last_contacted_at", { withTimezone: true }),
  prep_link_last_sent_at: timestamp("prep_link_last_sent_at", { withTimezone: true }),

  // Soft delete + timestamps
  archived_at: timestamp("archived_at", { withTimezone: true }),
  deleted_at: timestamp("deleted_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

// ---------------------------------------------------------------------------
// 2. Social links (multi-row, one row per platform)
// ---------------------------------------------------------------------------

export const guestCandidateSocialLinks = pgTable("guest_candidate_social_links", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  candidate_id: text("candidate_id")
    .notNull()
    .references(() => guestCandidates.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(), // instagram, x, youtube, linkedin, website, tiktok, other
  url: text("url").notNull(),
  label: text("label"),
  is_primary: boolean("is_primary").default(false),
  confidence_score: real("confidence_score"),
  source: text("source").default("manual"), // manual, ai_suggested
  verified_by_admin: boolean("verified_by_admin").default(false),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

// ---------------------------------------------------------------------------
// 3. Status history (audit trail of status changes)
// ---------------------------------------------------------------------------

export const guestCandidateStatusHistory = pgTable("guest_candidate_status_history", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  candidate_id: text("candidate_id")
    .notNull()
    .references(() => guestCandidates.id, { onDelete: "cascade" }),
  old_status: text("old_status"),
  new_status: text("new_status").notNull(),
  changed_by: text("changed_by"), // admin user id
  change_note: text("change_note"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

// ---------------------------------------------------------------------------
// 4. AI runs (versioned generation history)
// ---------------------------------------------------------------------------

export const guestCandidateAiRuns = pgTable("guest_candidate_ai_runs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  candidate_id: text("candidate_id")
    .notNull()
    .references(() => guestCandidates.id, { onDelete: "cascade" }),
  run_type: text("run_type").notNull(), // discovery, profile_analysis, outreach_generation, prep_analysis
  model_name: text("model_name").notNull(),
  input_snapshot_json: jsonb("input_snapshot_json").$type<Record<string, unknown>>(),
  output_snapshot_json: jsonb("output_snapshot_json").$type<Record<string, unknown>>(),
  started_at: timestamp("started_at", { withTimezone: true }).defaultNow(),
  completed_at: timestamp("completed_at", { withTimezone: true }),
  status: text("status").notNull().default("running"), // running, ready, error
  error_message: text("error_message"),
})

// ---------------------------------------------------------------------------
// 5. Outreach messages (saved versions)
// ---------------------------------------------------------------------------

export const guestCandidateOutreachMessages = pgTable("guest_candidate_outreach_messages", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  candidate_id: text("candidate_id")
    .notNull()
    .references(() => guestCandidates.id, { onDelete: "cascade" }),
  channel_type: text("channel_type").notNull(), // whatsapp, email, dm
  tone: text("tone").notNull(), // formal, warm, concise, premium
  subject_line: text("subject_line"),
  message_body: text("message_body").notNull(),
  generated_by_ai: boolean("generated_by_ai").default(true),
  edited_by_admin: boolean("edited_by_admin").default(false),
  version_number: integer("version_number").notNull().default(1),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

// ---------------------------------------------------------------------------
// 6. Prep form templates (admin builds reusable templates)
// ---------------------------------------------------------------------------

export interface PrepFormFieldDef {
  id: string
  type:
    | "short_text"
    | "long_text"
    | "single_select"
    | "multi_select"
    | "yes_no"
    | "date"
    | "location"
    | "contact_preference"
    | "instructions"
  label: string
  description?: string
  required?: boolean
  options?: string[] // for select types
  placeholder?: string
}

export interface PrepFormSectionDef {
  id: string
  title: string
  description?: string
  fields: PrepFormFieldDef[]
}

export interface PrepFormSchema {
  sections: PrepFormSectionDef[]
}

export const prepFormTemplates = pgTable("prep_form_templates", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  is_default: boolean("is_default").default(false),
  is_active: boolean("is_active").default(true),
  schema_json: jsonb("schema_json").$type<PrepFormSchema>().notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

// ---------------------------------------------------------------------------
// 7. Prep form links (token-based public access)
// ---------------------------------------------------------------------------

export const prepFormLinks = pgTable("prep_form_links", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  candidate_id: text("candidate_id")
    .notNull()
    .references(() => guestCandidates.id, { onDelete: "cascade" }),
  template_id: text("template_id")
    .notNull()
    .references(() => prepFormTemplates.id, { onDelete: "restrict" }),

  // Token (random secure URL slug, also used as the public lookup key)
  token: text("token").notNull().unique(),

  // Lifecycle
  status: text("status").notNull().default("draft"), // draft, sent, opened, in_progress, completed, expired, cancelled
  expires_at: timestamp("expires_at", { withTimezone: true }),
  first_opened_at: timestamp("first_opened_at", { withTimezone: true }),
  last_opened_at: timestamp("last_opened_at", { withTimezone: true }),
  submitted_at: timestamp("submitted_at", { withTimezone: true }),

  // Delivery context
  sent_via: text("sent_via"), // whatsapp, email, manual_copy
  location_note: text("location_note"),
  meeting_note: text("meeting_note"),
  admin_message: text("admin_message"),

  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

// ---------------------------------------------------------------------------
// 8. Prep form responses (what the candidate submitted)
// ---------------------------------------------------------------------------

export const prepFormResponses = pgTable("prep_form_responses", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  prep_link_id: text("prep_link_id")
    .notNull()
    .references(() => prepFormLinks.id, { onDelete: "cascade" }),
  candidate_id: text("candidate_id")
    .notNull()
    .references(() => guestCandidates.id, { onDelete: "cascade" }),
  response_json: jsonb("response_json").$type<Record<string, unknown>>().notNull(),
  completion_percent: real("completion_percent").default(0),
  submitted_at: timestamp("submitted_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

// ---------------------------------------------------------------------------
// 9. AI analysis of prep responses
// ---------------------------------------------------------------------------

export const prepFormResponseAnalysis = pgTable("prep_form_response_analysis", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  response_id: text("response_id")
    .notNull()
    .references(() => prepFormResponses.id, { onDelete: "cascade" }),
  candidate_id: text("candidate_id")
    .notNull()
    .references(() => guestCandidates.id, { onDelete: "cascade" }),
  ai_personality_summary: text("ai_personality_summary"),
  ai_talking_points_json: jsonb("ai_talking_points_json").$type<string[]>().default([]),
  ai_sensitive_topics_json: jsonb("ai_sensitive_topics_json").$type<string[]>().default([]),
  ai_preferred_angles_json: jsonb("ai_preferred_angles_json").$type<string[]>().default([]),
  ai_followup_questions_json: jsonb("ai_followup_questions_json").$type<string[]>().default([]),
  ai_red_flags_json: jsonb("ai_red_flags_json").$type<string[]>().default([]),
  ai_practical_notes: text("ai_practical_notes"),
  ai_opening_line: text("ai_opening_line"),
  ai_recommended_style: text("ai_recommended_style"),
  model_name: text("model_name"),
  generated_at: timestamp("generated_at", { withTimezone: true }).defaultNow(),
})

// ---------------------------------------------------------------------------
// 10. Notifications log
// ---------------------------------------------------------------------------

export const guestCandidateNotifications = pgTable("guest_candidate_notifications", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  candidate_id: text("candidate_id")
    .notNull()
    .references(() => guestCandidates.id, { onDelete: "cascade" }),
  prep_link_id: text("prep_link_id")
    .references(() => prepFormLinks.id, { onDelete: "set null" }),
  notification_type: text("notification_type").notNull(), // prep_submitted, prep_opened, reminder_sent, outreach_generated, status_changed
  delivery_channel: text("delivery_channel").notNull(), // email, in_app
  recipient: text("recipient"),
  payload_json: jsonb("payload_json").$type<Record<string, unknown>>(),
  delivered_at: timestamp("delivered_at", { withTimezone: true }),
  delivery_error: text("delivery_error"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

// ---------------------------------------------------------------------------
// 11. Prep meetings (pre-recording preparation calls / visits)
// ---------------------------------------------------------------------------
//
// Mirrors partner_meetings (lib/db/schema/partnership-crm.ts) but keyed to a
// candidate: manually-scheduled preparation meetings with a status lifecycle,
// notes, and an outcome. No calendar integration — the admin schedules and
// logs these by hand. FK-cascades off the candidate.

export const guestPrepMeetings = pgTable(
  "guest_prep_meetings",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    candidate_id: text("candidate_id")
      .notNull()
      .references(() => guestCandidates.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** call | video | in_person */
    type: text("type").notNull().default("video"),
    scheduled_at: timestamp("scheduled_at", { withTimezone: true }),
    duration_minutes: integer("duration_minutes"),
    notes: text("notes"),
    outcome: text("outcome"),
    /** scheduled | completed | cancelled */
    status: text("status").notNull().default("scheduled"),
    created_by: text("created_by"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("idx_guest_prep_meetings_candidate").on(t.candidate_id)],
)

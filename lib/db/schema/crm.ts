/**
 * Shared CRM core — polymorphic relationship spine.
 *
 * The same three universal primitives every relationship needs: an append-only
 * activity timeline, internal notes, and tasks/reminders. Polymorphic by
 * (subject_kind, subject_id) so one set of tables serves multiple domains —
 * "guest" applications today, and "partner" leads can migrate here next (the
 * partner_* tables are a working specialization with no production data yet).
 *
 * Polymorphic rows can't FK-cascade, so callers must delete a subject's CRM
 * rows when the subject is deleted (see lib/crm/*.deleteForSubject).
 */

import { pgTable, text, timestamp, jsonb, boolean, index } from "drizzle-orm/pg-core"

/** What kind of entity a CRM row hangs off. */
export type CrmSubjectKind = "guest" | "partner"

export const crmActivities = pgTable(
  "crm_activities",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    subject_kind: text("subject_kind").notNull(),
    subject_id: text("subject_id").notNull(),
    /** Domain-specific event vocab (e.g. application_created, evaluation_completed). */
    type: text("type").notNull(),
    summary: text("summary").notNull(),
    /** "admin:<email>" | "system:auto-triage" | "ai:casting" | "public" */
    actor: text("actor"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("idx_crm_activities_subject").on(t.subject_kind, t.subject_id, t.created_at)],
)

export const crmNotes = pgTable(
  "crm_notes",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    subject_kind: text("subject_kind").notNull(),
    subject_id: text("subject_id").notNull(),
    body: text("body").notNull(),
    author: text("author"),
    pinned: boolean("pinned").notNull().default(false),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("idx_crm_notes_subject").on(t.subject_kind, t.subject_id)],
)

export const crmTasks = pgTable(
  "crm_tasks",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    subject_kind: text("subject_kind").notNull(),
    subject_id: text("subject_id").notNull(),
    title: text("title").notNull(),
    detail: text("detail"),
    /** Domain task vocab: follow_up | reply | invite | prep | schedule | call | email | custom */
    type: text("type").notNull().default("follow_up"),
    /** open | done | dismissed */
    status: text("status").notNull().default("open"),
    /** low | normal | high */
    priority: text("priority").notNull().default("normal"),
    due_at: timestamp("due_at", { withTimezone: true }),
    /** "admin:<email>" | "ai:casting" */
    created_by: text("created_by"),
    completed_at: timestamp("completed_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_crm_tasks_subject").on(t.subject_kind, t.subject_id),
    index("idx_crm_tasks_due").on(t.status, t.due_at),
  ],
)

/**
 * Community contribution hub — the unified intake for everything a website
 * visitor proposes: a guest, an episode topic, a discussion question, a content
 * concept, or an improvement idea.
 *
 * All five types land in ONE inbox (anonymous input must pass a review gate
 * before it can touch Khat Brain). AI triage scores quality + flags spam +
 * recommends an action; the operator then approves and "routes" the
 * contribution into the right downstream artifact (candidate / market signal /
 * questions pool / original-thinking bank / editorial inbox).
 *
 * Relationship history (notes, tasks, timeline) lives on the shared polymorphic
 * CRM core under subject_kind = "community".
 */

import { pgTable, text, integer, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core"
import type { CommunityTriageStatus } from "@/types/database"

export const communityContributions = pgTable(
  "community_contributions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    /** guest | topic | question | concept | improvement */
    type: text("type").notNull(),
    /** Headline: guest name, topic title, the question, concept title, etc. */
    title: text("title").notNull(),
    /** The substance: reason / description / the idea, free text. */
    body: text("body").notNull(),
    /** Type-specific extras (guest: field/social_links; topic: link; etc.). */
    details: jsonb("details").$type<Record<string, unknown>>().default({}),

    // ─── Contributor (optional — submissions can be anonymous) ────────────────
    contributor_name: text("contributor_name"),
    contributor_email: text("contributor_email"),
    /** Human-friendly reference (KHAT-C-XXXXXX), derived from id. */
    reference: text("reference"),

    /** new | reviewing | accepted | routed | declined */
    status: text("status").notNull().default("new"),
    /** When routed: what downstream artifact it became. */
    routed_kind: text("routed_kind"),
    routed_id: text("routed_id"),
    routed_at: timestamp("routed_at", { withTimezone: true }),

    // ─── Recognition + follow-up ────────────────────────────────────────────────
    /** Operator opt-in: feature this on the public "صُنع مع المجتمع" wall. */
    public_credit: boolean("public_credit").notNull().default(false),
    /** When the contributor was emailed about the outcome (accepted/routed) — guards a single send. */
    outcome_emailed_at: timestamp("outcome_emailed_at", { withTimezone: true }),

    // ─── AI triage ────────────────────────────────────────────────────────────
    /** generating | ready | error — always set (default + notNull); matches the non-null type contract. */
    triage_status: text("triage_status").$type<CommunityTriageStatus>().notNull().default("generating"),
    /** 0-100 editorial quality / promise. */
    quality_score: integer("quality_score"),
    /** AI editorial category (free-ish: e.g. philosophy, society, tech…). */
    category: text("category"),
    /** One-line summary for the operator. */
    ai_summary: text("ai_summary"),
    /** Strengths / why it's worth pursuing. */
    highlights: jsonb("highlights").$type<string[]>().default([]),
    /** Concerns / gaps. */
    concerns: jsonb("concerns").$type<string[]>().default([]),
    /** Likely spam / low-effort / abuse. */
    spam: boolean("spam").notNull().default(false),
    /** advance | request_info | nurture | decline */
    recommended_action: text("recommended_action"),
    action_rationale: text("action_rationale"),
    ai_raw: jsonb("ai_raw").$type<Record<string, unknown>>(),
    error_message: text("error_message"),
    triaged_at: timestamp("triaged_at", { withTimezone: true }),

    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_community_type_status").on(t.type, t.status),
    index("idx_community_created").on(t.created_at),
  ],
)

/**
 * «نسخة الضيف» — the guest's private link for ONE episode.
 *
 * One active row per (episode, guest). The guest opens `/prepare/[token]`,
 * answers a short questionnaire, then reads a PUBLISHED SNAPSHOT of the prep —
 * never the live prep. The snapshot (`published_view`) is written only by
 * `toGuestPrepView()` in lib/guest-link/view.ts, an allowlist projection; that
 * function is the security boundary, not this table.
 *
 * Deliberately separate from `guest_prep_forms` (keyed on guest_applications):
 * those links are already in guests' hands and keep working unchanged — the
 * page resolves this table first and falls back to the legacy one.
 *
 * CHECK constraints (status / suggestion enums / body length) live in
 * scripts/post-schema.sql and in migration 0031, both idempotent.
 */

import { sql } from "drizzle-orm"
import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { episodeIntelligenceRecords } from "./eir"
import { guests } from "./guests"

export const guestEpisodeLinks = pgTable(
  "guest_episode_links",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    eir_id: text("eir_id")
      .notNull()
      .references(() => episodeIntelligenceRecords.id, { onDelete: "cascade" }),
    /** Canonical guest when the EIR has one; null when only a prep name exists. */
    guest_id: text("guest_id").references(() => guests.id, { onDelete: "set null" }),
    /** Name the admin typed — the greeting uses it until the guest gives a kunya. */
    guest_display_name: text("guest_display_name").notNull(),

    // ─── Token ─────────────────────────────────────────────────────────
    /** SHA-256 of the raw token (lib/preparation/token.ts pattern). Raw never stored. */
    token_hash: text("token_hash").notNull().unique(),
    /** active | revoked (CHECK in post-schema.sql). */
    status: text("status").notNull().default("active"),
    revoked_at: timestamp("revoked_at", { withTimezone: true }),
    /**
     * Fallback expiry = issue time + 14 days. When the EIR has a recording
     * date the effective expiry is that date + 3 days instead — computed at
     * read time (lib/guest-link/access.ts) so a date set later still counts.
     */
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),

    // ─── Questionnaire ────────────────────────────────────────────────
    questionnaire: jsonb("questionnaire").$type<Record<string, unknown>>(),
    questionnaire_submitted_at: timestamp("questionnaire_submitted_at", { withTimezone: true }),
    questionnaire_draft: jsonb("questionnaire_draft").$type<Record<string, unknown>>(),
    questionnaire_draft_step: integer("questionnaire_draft_step"),
    welcome_seen_at: timestamp("welcome_seen_at", { withTimezone: true }),

    // ─── Published snapshot ───────────────────────────────────────────
    /** Output of toGuestPrepView() — the ONLY prep data the guest ever receives. */
    published_view: jsonb("published_view").$type<Record<string, unknown>>(),
    /** Server-only: opaque guest refs (a1, s3…) → section kind / question id. */
    published_ref_map: jsonb("published_ref_map").$type<Record<string, unknown>>(),
    published_at: timestamp("published_at", { withTimezone: true }),
    published_by: text("published_by"),
    published_source_prep_id: text("published_source_prep_id"),
    published_source_prep_updated_at: timestamp("published_source_prep_updated_at", {
      withTimezone: true,
    }),
    /** recording_scheduled_at as it was at publish — stale badge when it moves. */
    published_schedule_at: timestamp("published_schedule_at", { withTimezone: true }),
    /** Admin curation of sample questions: { [questionId]: { hidden?, text?, pinned? } }. */
    sample_overrides: jsonb("sample_overrides")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),

    // ─── Filming location (a home — shown only after publish) ─────────
    location_label: text("location_label"),
    address: text("address"),
    map_url: text("map_url"),
    /** Filename under data/guest-homes/ — served only through the token route. */
    house_photo: text("house_photo"),
    show_schedule: boolean("show_schedule").notNull().default(true),
    location_updated_at: timestamp("location_updated_at", { withTimezone: true }),

    // ─── Opens ────────────────────────────────────────────────────────
    first_opened_at: timestamp("first_opened_at", { withTimezone: true }),
    last_opened_at: timestamp("last_opened_at", { withTimezone: true }),
    open_count: integer("open_count").notNull().default(0),

    created_by: text("created_by"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One live link per guest per episode. COALESCE so an EIR without a
    // canonical guest still gets exactly one.
    uniqueIndex("uq_guest_episode_links_active")
      .on(t.eir_id, sql`COALESCE(${t.guest_id}, '')`)
      .where(sql`${t.revoked_at} IS NULL`),
    index("idx_guest_episode_links_eir").on(t.eir_id),
  ],
)

export const guestEpisodeSuggestions = pgTable(
  "guest_episode_suggestions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    link_id: text("link_id")
      .notNull()
      .references(() => guestEpisodeLinks.id, { onDelete: "cascade" }),
    eir_id: text("eir_id").notNull(),
    /** axis | question | general (CHECK in post-schema.sql). */
    target_kind: text("target_kind").notNull(),
    /** Opaque guest ref (a2 / s5) — resolved via published_ref_map. */
    target_ref: text("target_ref"),
    /** The text the guest was looking at, copied server-side from the snapshot. */
    original_text: text("original_text"),
    /** edit | comment | new_question (CHECK). */
    suggestion_type: text("suggestion_type").notNull(),
    /** Plain text, 1–1000 chars (CHECK). Sanitized before insert. */
    body: text("body").notNull(),
    /** new | accepted | rejected (CHECK). */
    status: text("status").notNull().default("new"),
    decided_by: text("decided_by"),
    decided_at: timestamp("decided_at", { withTimezone: true }),
    /** Set once the guest has seen «تم الأخذ باقتراحك». */
    guest_notified_at: timestamp("guest_notified_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_guest_episode_suggestions_link").on(t.link_id, t.status),
    index("idx_guest_episode_suggestions_eir").on(t.eir_id, t.status),
  ],
)

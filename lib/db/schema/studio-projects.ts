/**
 * Studio Wave 2 — the "episode project" spine that links the three
 * phases of a produced episode into ONE journey.
 *
 * Today the three phases (raw upload → review → publish) live in
 * SEPARATE studio_sessions with no link between them: the raw cut and
 * the post-montage edited cut are orphan rows. `studio_projects` is the
 * parent that ties them together, holds the journey `state`, and is the
 * anchor future steps hang the raw-vs-edited review (Phase 2) and the
 * publish gate (Phase 3) off of.
 *
 * Column typing is deliberate (Yousef's data model):
 *   - `id` / `eir_id` are TEXT (episode_intelligence_records.id is text).
 *   - `raw_session_id` / `edited_session_id` are UUID — studio_sessions.id
 *     is a uuid PK, so these MUST match or the FK is invalid.
 *
 * All three FKs are ON DELETE SET NULL, never CASCADE: deleting a
 * session (or an EIR) must NOT delete the project — the project holds
 * the journey history and outlives any single session. This is the
 * opposite of performance_snapshots.eir_id (which cascades); do not copy
 * that here.
 *
 * There is intentionally NO reverse `project_id` column on
 * studio_sessions — a mutual FK is unnecessary. Look a project up by its
 * raw/edited_session_id instead.
 */

import { pgTable, text, uuid, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { episodeIntelligenceRecords } from "./eir"
import { studioSessions } from "./studio"

/**
 * The linked-episode journey states, in order:
 *   draft         — project row exists, nothing attached yet (DB default)
 *   raw_uploaded  — the raw recording is uploaded (Phase 1 start)
 *   mapped        — the episode time-map is generated (Phase 1 done)
 *   reviewed      — the raw-vs-edited review is complete (Phase 2 — later step)
 *   finalized     — content passed the publish gate (Phase 3 — later step)
 *   published     — pushed to the public episode
 *
 * The legal transitions between these live in lib/studio/projects.ts and
 * are enforced there — an illegal jump throws, it never silently passes.
 */
export const STUDIO_PROJECT_STATES = [
  "draft",
  "raw_uploaded",
  "mapped",
  "reviewed",
  "finalized",
  "published",
] as const
export type StudioProjectState = (typeof STUDIO_PROJECT_STATES)[number]

export const studioProjects = pgTable(
  "studio_projects",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /** Spine link to the master EIR. SET NULL on EIR delete — project survives. */
    eir_id: text("eir_id").references(() => episodeIntelligenceRecords.id, {
      onDelete: "set null",
    }),

    /** The Phase-1 raw recording session. uuid — matches studio_sessions.id. */
    raw_session_id: uuid("raw_session_id").references(() => studioSessions.id, {
      onDelete: "set null",
    }),

    /** The Phase-2 post-montage edited session. uuid — matches studio_sessions.id. */
    edited_session_id: uuid("edited_session_id").references(() => studioSessions.id, {
      onDelete: "set null",
    }),

    state: text("state").$type<StudioProjectState>().notNull().default("draft"),

    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_studio_projects_eir").on(t.eir_id),
    index("idx_studio_projects_raw_session").on(t.raw_session_id),
    index("idx_studio_projects_edited_session").on(t.edited_session_id),
    // At most one project per EIR. Partial — orphan/EIR-less projects
    // (YouTube/legacy imports never create one, but a project can predate
    // its EIR) are exempt from the uniqueness rule.
    uniqueIndex("uq_studio_projects_eir")
      .on(t.eir_id)
      .where(sql`eir_id IS NOT NULL`),
  ],
)

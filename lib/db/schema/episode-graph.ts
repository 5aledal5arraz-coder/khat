/**
 * Episode knowledge-graph tables (Studio redesign, Goal 2).
 *
 * These power the Website knowledge hub: multi-guest attribution, real
 * "related episodes" (semantic, not "first N"), and a topic taxonomy with
 * topic pages. All ADDITIVE — `episodes.guest_id` stays as the primary-guest
 * denormalization; these augment it without breaking existing reads.
 */

import { pgTable, text, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core"
import { episodes } from "./episodes"
import { guests } from "./guests"

/** Roles a person can hold on an episode. */
export const EPISODE_GUEST_ROLES = ["guest", "host", "cohost"] as const
export type EpisodeGuestRole = (typeof EPISODE_GUEST_ROLES)[number]

/**
 * Multi-guest junction — replaces the 1:1 `episodes.guest_id` for display
 * while keeping it as the primary-guest denormalization.
 */
export const episodeGuests = pgTable(
  "episode_guests",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    episode_id: text("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
    guest_id: text("guest_id").notNull().references(() => guests.id, { onDelete: "cascade" }),
    role: text("role").$type<EpisodeGuestRole>().notNull().default("guest"),
    appearance_order: integer("appearance_order").notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_episode_guests_episode_guest").on(t.episode_id, t.guest_id),
    index("idx_episode_guests_episode").on(t.episode_id),
    index("idx_episode_guests_guest").on(t.guest_id),
  ],
)

/** Relation kinds between two episodes. */
export const EPISODE_RELATION_TYPES = ["related", "same_guest", "same_topic", "continuation"] as const
export type EpisodeRelationType = (typeof EPISODE_RELATION_TYPES)[number]

/**
 * Semantic links between episodes — replaces the naive "first N" related list.
 * Directed: (episode_id → related_episode_id). Backfill writes both directions
 * where appropriate.
 */
export const episodeRelationships = pgTable(
  "episode_relationships",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    episode_id: text("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
    related_episode_id: text("related_episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
    relation_type: text("relation_type").$type<EpisodeRelationType>().notNull().default("related"),
    /** Relevance 0..100 — higher is more related. */
    score: integer("score").notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_episode_rel").on(t.episode_id, t.related_episode_id, t.relation_type),
    index("idx_episode_rel_episode").on(t.episode_id),
    index("idx_episode_rel_related").on(t.related_episode_id),
  ],
)

/** Topic taxonomy — backs related-topics chips + topic pages. */
export const topics = pgTable(
  "topics",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    slug: text("slug").unique().notNull(),
    description: text("description"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("idx_topics_slug").on(t.slug)],
)

/** Episode ↔ topic junction. */
export const episodeTopics = pgTable(
  "episode_topics",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    episode_id: text("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
    topic_id: text("topic_id").notNull().references(() => topics.id, { onDelete: "cascade" }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_episode_topics").on(t.episode_id, t.topic_id),
    index("idx_episode_topics_episode").on(t.episode_id),
    index("idx_episode_topics_topic").on(t.topic_id),
  ],
)

/**
 * Phase X Step 2 — Original Thinking topic bank.
 *
 * The editorial-conscience layer. Every row is a candidate topic
 * generated WITHOUT any market data — pure philosophical / psychological
 * lens output. Topics expire after 90 days unused (the editor's taste
 * shifts; old "originals" stale fast).
 *
 * Consumed_at is stamped when the Hybrid Generator (Step 3) picks the
 * topic up; from then on it is excluded from regeneration loops.
 */

import {
  pgTable,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core"

export const originalThinkingTopics = pgTable(
  "original_thinking_topics",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    title: text("title").notNull(),
    /** FK-by-convention to config/lenses.json key. Not enforced at DB level. */
    lens: text("lens").notNull(),
    philosophical_frame: text("philosophical_frame").notNull(),
    conflict: text("conflict").notNull(),
    emotional_hook: text("emotional_hook").notNull(),
    language: text("language").notNull().default("ar"),

    generated_at: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Set by the Hybrid Generator when it picks this topic up. */
    consumed_at: timestamp("consumed_at", { withTimezone: true }),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("idx_original_topics_generated_at").on(t.generated_at),
    index("idx_original_topics_lens").on(t.lens),
    index("idx_original_topics_language").on(t.language),
    /**
     * Hot path: "give me unconsumed and unexpired topics." The partial
     * index is small + fast; the planner uses it for the bank list.
     */
    index("idx_original_topics_unconsumed").on(t.generated_at),
  ],
)

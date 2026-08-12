import { pgTable, text, integer, date, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core"

/**
 * The episode page BEFORE the episode exists.
 *
 * Khaled writes it by hand — the subject, the axes the conversation will cover —
 * and publishes it while the episode is still unfilmed, so a season-two guest in
 * the homepage strip leads somewhere instead of nowhere. When the episode airs,
 * THE SAME URL becomes the episode page.
 *
 * ── WHY A SEPARATE TABLE AND NOT A ROW IN `episodes` ────────────────────────
 * `episodes` is, by construction, "the table of things that have a video":
 * `episodes.id` IS the YouTube video id, and `youtube_url`, `release_date` and
 * `title` are all NOT NULL. A row without a video fights every invariant it has.
 *
 * The decisive reason is safety, though. `episodes.status` exists but NOTHING
 * public filters on it — hiding is done by two side tables applied in memory —
 * so a draft row would surface immediately in the sitemap, the public
 * `/api/episodes`, the archive, the homepage hero and grid, the guest page, the
 * category and topic pages, and the "related" rail on every published episode.
 * That is a DENY-list: every new surface leaks by default until someone
 * remembers to block it. This table is an ALLOW-list — nothing reads it until a
 * reader is written on purpose.
 *
 * It also avoids a quieter trap: `timestamps`, `quotes`, `resources` and
 * `episode_sponsors` all cascade on delete from `episodes.id`. Deleting a
 * placeholder row after the transition would silently take anything that
 * accumulated on it.
 *
 * ── THE SLUG IS THE POINT ───────────────────────────────────────────────────
 * Khaled distributes this link before the episode exists — in the newsletter, on
 * X, on Instagram. So the slug is chosen HERE, once, and the published episode
 * inherits it at the transition. It is not derived from the YouTube title,
 * which nobody knows in advance. `/episodes/<slug>` resolves published-first and
 * falls back here, so one URL serves both eras and no redirect is ever needed.
 */
export const upcomingEpisodes = pgTable(
  "upcoming_episodes",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

    /**
     * The Episode Intelligence Record this page belongs to. UNIQUE: one public
     * page per planned episode. No Drizzle `.references()` — same convention as
     * `episodes.eir_id`, whose FK is installed by migration to avoid a circular
     * import between the schema files.
     */
    eir_id: text("eir_id").notNull().unique(),

    /**
     * The permanent public slug, unique here AND checked against
     * `episodes.slug` when reserved. Two tables cannot share one UNIQUE index,
     * so the reservation helper checks both and the transition writes this
     * value onto the episode row inside a transaction — where a genuine
     * collision fails loudly instead of silently minting a suffixed URL.
     */
    slug: text("slug").notNull().unique(),

    /** Nullable on purpose: an episode may be planned before a guest is fixed. */
    guest_id: text("guest_id"),

    /** The public title. Distinct from the EIR's `working_title`, which is internal. */
    title: text("title").notNull(),

    /** «موضوع الحلقة» — Khaled's own prose. */
    summary: text("summary"),

    /** «المحاور» — an ordered list of strings, written by hand. */
    axes: jsonb("axes").$type<string[]>().default([]),

    /**
     * A word from the guest BEFORE the episode airs. Deliberately not the same
     * field as `episodes.guest_testimonial`: that one is a testimonial («after
     * recording, I recommend it») and this one is an invitation («I recorded an
     * episode about X, I hope you hear it»). Same shape, different speech act,
     * different attribution line.
     */
    guest_message: text("guest_message"),
    guest_message_audio_url: text("guest_message_audio_url"),
    guest_message_audio_duration: integer("guest_message_audio_duration"),

    /**
     * Optional, per Khaled's call: filled → the page names the day; empty → it
     * says «قريباً». An announced date is a commitment, and a slip is visible,
     * so this stays a choice per episode rather than a rule.
     */
    expected_date: date("expected_date"),

    /**
     * draft → nothing public. published → live at the slug.
     * withdrawn → the guest pulled out or the episode was cancelled AFTER the
     * link was already distributed. Deleting the row instead would 404 a link
     * that is out in the world, which is the one outcome to avoid.
     */
    status: text("status").notNull().default("draft"),

    /** Set at the transition. Non-null means this page has become an episode. */
    published_episode_id: text("published_episode_id"),

    /** Guard state: set when the guard notices the episode aired and this page did not follow. */
    needs_attention: boolean("needs_attention").notNull().default(false),

    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_upcoming_episodes_status").on(t.status),
    index("idx_upcoming_episodes_guest").on(t.guest_id),
  ],
)

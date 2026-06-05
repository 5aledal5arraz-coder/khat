/**
 * Official Platform Links — the single source of truth for all external
 * KHAT accounts (social media, audio platforms, video platforms, website,
 * newsletter, etc.).
 *
 * Table name is kept as `podcast_platform_links` for backward compatibility
 * with existing data + migrations. The Drizzle export `officialPlatformLinks`
 * is the semantic name used by new code.
 */

import { pgTable, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core"

export const officialPlatformLinks = pgTable(
  "podcast_platform_links",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

    // Identity
    platform_key: text("platform_key").unique().notNull(),
    platform_name: text("platform_name").notNull(),
    url: text("url").notNull(),
    handle: text("handle"),
    icon_name: text("icon_name"),

    // Classification
    // social | audio | video | website | newsletter | community | other
    category: text("category").notNull().default("other"),
    is_primary: boolean("is_primary").default(false),

    // Lifecycle
    is_active: boolean("is_active").default(true),
    sort_order: integer("sort_order").default(0),

    // Surface visibility — what pages/components this link should appear on
    show_in_header: boolean("show_in_header").default(false),
    show_in_footer: boolean("show_in_footer").default(true),
    show_on_homepage: boolean("show_on_homepage").default(false),
    show_on_episode_page: boolean("show_on_episode_page").default(false),
    show_on_about_page: boolean("show_on_about_page").default(false),
    show_on_contact_page: boolean("show_on_contact_page").default(false),
    show_on_guest_page: boolean("show_on_guest_page").default(false),

    notes_internal: text("notes_internal"),

    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    activeCategoryIdx: index("opl_active_category_idx").on(t.is_active, t.category),
    sortOrderIdx: index("opl_sort_order_idx").on(t.sort_order),
  }),
)

// Legacy alias — keep existing imports working
export const podcastPlatformLinks = officialPlatformLinks

export type OfficialPlatformLink = typeof officialPlatformLinks.$inferSelect
export type NewOfficialPlatformLink = typeof officialPlatformLinks.$inferInsert

export type PlatformCategory =
  | "social"
  | "audio"
  | "video"
  | "website"
  | "newsletter"
  | "community"
  | "other"

export type PlatformSurface =
  | "header"
  | "footer"
  | "homepage"
  | "episode_page"
  | "about_page"
  | "contact_page"
  | "guest_page"

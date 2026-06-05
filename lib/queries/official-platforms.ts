/**
 * Official Platform Links — queries.
 *
 * This is the single source of truth for all external KHAT accounts. Every
 * frontend surface that renders official platform URLs MUST read from here.
 */

import { db } from "@/lib/db"
import { officialPlatformLinks } from "@/lib/db/schema"
import { and, eq, asc } from "drizzle-orm"
import type {
  OfficialPlatformLink,
  NewOfficialPlatformLink,
  PlatformCategory,
  PlatformSurface,
} from "@/lib/db/schema/audio-platforms"

export type { OfficialPlatformLink, NewOfficialPlatformLink, PlatformCategory, PlatformSurface }

// ---------------------------------------------------------------------------
// Read queries
// ---------------------------------------------------------------------------

export async function listAllPlatforms(): Promise<OfficialPlatformLink[]> {
  if (!db) return []
  return db
    .select()
    .from(officialPlatformLinks)
    .orderBy(asc(officialPlatformLinks.sort_order))
}

export async function listActivePlatforms(opts: {
  category?: PlatformCategory
} = {}): Promise<OfficialPlatformLink[]> {
  if (!db) return []
  const conditions = [eq(officialPlatformLinks.is_active, true)]
  if (opts.category) conditions.push(eq(officialPlatformLinks.category, opts.category))
  return db
    .select()
    .from(officialPlatformLinks)
    .where(and(...conditions))
    .orderBy(asc(officialPlatformLinks.sort_order))
}

const SURFACE_COLUMN: Record<PlatformSurface, keyof typeof officialPlatformLinks._.columns> = {
  header: "show_in_header",
  footer: "show_in_footer",
  homepage: "show_on_homepage",
  episode_page: "show_on_episode_page",
  about_page: "show_on_about_page",
  contact_page: "show_on_contact_page",
  guest_page: "show_on_guest_page",
}

/**
 * Return active platforms that should render on a specific surface.
 * This is the primary query used by frontend components.
 */
export async function listPlatformsForSurface(
  surface: PlatformSurface,
  opts: { category?: PlatformCategory } = {},
): Promise<OfficialPlatformLink[]> {
  if (!db) return []
  const col = officialPlatformLinks[SURFACE_COLUMN[surface]]
  const conditions = [
    eq(officialPlatformLinks.is_active, true),
    eq(col, true),
  ]
  if (opts.category) conditions.push(eq(officialPlatformLinks.category, opts.category))
  return db
    .select()
    .from(officialPlatformLinks)
    .where(and(...conditions))
    .orderBy(asc(officialPlatformLinks.sort_order))
}

export async function getPlatformById(id: string): Promise<OfficialPlatformLink | null> {
  if (!db) return null
  const rows = await db
    .select()
    .from(officialPlatformLinks)
    .where(eq(officialPlatformLinks.id, id))
    .limit(1)
  return rows[0] || null
}

export async function getPlatformByKey(key: string): Promise<OfficialPlatformLink | null> {
  if (!db) return null
  const rows = await db
    .select()
    .from(officialPlatformLinks)
    .where(eq(officialPlatformLinks.platform_key, key))
    .limit(1)
  return rows[0] || null
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createPlatform(
  data: Omit<NewOfficialPlatformLink, "id" | "created_at" | "updated_at">,
): Promise<OfficialPlatformLink | null> {
  if (!db) return null
  const rows = await db.insert(officialPlatformLinks).values(data).returning()
  return rows[0] || null
}

export async function updatePlatform(
  id: string,
  data: Partial<Omit<NewOfficialPlatformLink, "id" | "created_at" | "updated_at">>,
): Promise<OfficialPlatformLink | null> {
  if (!db) return null
  const rows = await db
    .update(officialPlatformLinks)
    .set({ ...data, updated_at: new Date() })
    .where(eq(officialPlatformLinks.id, id))
    .returning()
  return rows[0] || null
}

export async function deletePlatform(id: string): Promise<boolean> {
  if (!db) return false
  const rows = await db
    .delete(officialPlatformLinks)
    .where(eq(officialPlatformLinks.id, id))
    .returning({ id: officialPlatformLinks.id })
  return rows.length > 0
}

export async function reorderPlatforms(
  items: Array<{ id: string; sort_order: number }>,
): Promise<void> {
  if (!db) return
  await Promise.all(
    items.map((item) =>
      db!
        .update(officialPlatformLinks)
        .set({ sort_order: item.sort_order, updated_at: new Date() })
        .where(eq(officialPlatformLinks.id, item.id)),
    ),
  )
}

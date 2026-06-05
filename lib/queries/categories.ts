import { db, USE_DB } from "@/lib/db"
import { episodeCategories, episodes } from "@/lib/db/schema"
import { eq, asc, count, sql } from "drizzle-orm"
import type { EpisodeCategory } from "@/types/database"

export async function getCategories(): Promise<EpisodeCategory[]> {
  if (!USE_DB) return []

  try {
    const rows = await db!
      .select()
      .from(episodeCategories)
      .orderBy(asc(episodeCategories.sort_order), asc(episodeCategories.name))

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      sort_order: r.sort_order ?? 0,
      created_at: r.created_at?.toISOString() ?? new Date().toISOString(),
    }))
  } catch (error) {
    console.error("Error fetching categories:", error)
    return []
  }
}

export async function getCategoryBySlug(slug: string): Promise<EpisodeCategory | null> {
  if (!USE_DB) return null

  try {
    const [row] = await db!
      .select()
      .from(episodeCategories)
      .where(eq(episodeCategories.slug, slug))
      .limit(1)

    if (!row) return null
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      sort_order: row.sort_order ?? 0,
      created_at: row.created_at?.toISOString() ?? new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export async function getCategoriesWithCounts(): Promise<(EpisodeCategory & { episodeCount: number })[]> {
  if (!USE_DB) return []

  try {
    const rows = await db!
      .select({
        id: episodeCategories.id,
        name: episodeCategories.name,
        slug: episodeCategories.slug,
        sort_order: episodeCategories.sort_order,
        created_at: episodeCategories.created_at,
        episodeCount: count(episodes.id),
      })
      .from(episodeCategories)
      .leftJoin(episodes, eq(episodes.category_id, episodeCategories.id))
      .groupBy(episodeCategories.id)
      .orderBy(asc(episodeCategories.sort_order), asc(episodeCategories.name))

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      sort_order: r.sort_order ?? 0,
      created_at: r.created_at?.toISOString() ?? new Date().toISOString(),
      episodeCount: r.episodeCount,
    }))
  } catch (error) {
    console.error("Error fetching categories with counts:", error)
    return []
  }
}

export async function createCategory(name: string, slug: string): Promise<{ success: boolean; error?: string; data?: EpisodeCategory }> {
  if (!USE_DB) return { success: false, error: "Database not configured" }

  try {
    // Get max sort_order
    const [maxRow] = await db!
      .select({ max: sql<number>`COALESCE(MAX(${episodeCategories.sort_order}), 0)` })
      .from(episodeCategories)
    const nextOrder = (Number(maxRow?.max) || 0) + 1

    const [row] = await db!
      .insert(episodeCategories)
      .values({ name, slug, sort_order: nextOrder })
      .returning()

    return {
      success: true,
      data: {
        id: row.id,
        name: row.name,
        slug: row.slug,
        sort_order: row.sort_order ?? nextOrder,
        created_at: row.created_at?.toISOString() ?? new Date().toISOString(),
      },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return { success: false, error: "هذا الاسم المختصر مستخدم بالفعل" }
    }
    return { success: false, error: msg }
  }
}

export async function updateCategory(id: string, name: string, slug: string): Promise<{ success: boolean; error?: string }> {
  if (!USE_DB) return { success: false, error: "Database not configured" }

  try {
    await db!
      .update(episodeCategories)
      .set({ name, slug })
      .where(eq(episodeCategories.id, id))
    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return { success: false, error: "هذا الاسم المختصر مستخدم بالفعل" }
    }
    return { success: false, error: msg }
  }
}

export async function deleteCategory(id: string): Promise<{ success: boolean; error?: string }> {
  if (!USE_DB) return { success: false, error: "Database not configured" }

  try {
    // Episodes with this category will have category_id set to null (ON DELETE SET NULL)
    await db!.delete(episodeCategories).where(eq(episodeCategories.id, id))
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function getCategoryById(id: string): Promise<EpisodeCategory | null> {
  if (!USE_DB) return null

  try {
    const [row] = await db!
      .select()
      .from(episodeCategories)
      .where(eq(episodeCategories.id, id))
      .limit(1)

    if (!row) return null
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      sort_order: row.sort_order ?? 0,
      created_at: row.created_at?.toISOString() ?? new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export async function assignCategoryToEpisode(
  episodeId: string,
  categoryId: string | null,
): Promise<number> {
  const { ensureEpisodeInDb } = await import("@/lib/episodes/ensure-row")
  const status = await ensureEpisodeInDb(episodeId)
  if (status === "not-found") {
    throw new Error(`Episode ${episodeId} not found in DB or YouTube cache`)
  }

  const result = await db!
    .update(episodes)
    .set({ category_id: categoryId, updated_at: new Date() })
    .where(eq(episodes.id, episodeId))
    .returning({ id: episodes.id })

  console.info(
    `[assignCategoryToEpisode] episode=${episodeId} category=${categoryId ?? "null"} rows=${result.length}`,
  )
  return result.length
}

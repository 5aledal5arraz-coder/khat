"use server"

import { revalidatePath } from "next/cache"
import {
  getEpisodeOverrides,
  setEpisodeOverride,
  deleteEpisodeOverride,
} from "@/lib/episodes/overrides"
import { assignGuestToEpisode as assignGuest } from "@/lib/episodes/guests"
import { setEpisodeSponsor } from "@/lib/queries/episode-sponsors"
import { requireAdmin, getAdminAuthUser } from "@/lib/api-utils"
import { ADMIN_LIMITS } from "@/lib/validation/forms"
import { invalidateEpisodeCache, getCacheStatus } from "@/lib/cache/episode-cache"
import { invalidate } from "@/lib/cache"
import { saveVersion } from "@/lib/episodes/versions"
import {
  markEpisodesAsDeleted,
  getDeletedEpisodeIds,
  restoreDeletedEpisodes,
} from "@/lib/episodes/deleted"
import { ensureEpisodeInDb } from "@/lib/episodes/ensure-row"
import { fetchAllEpisodes as ytFetchAll } from "@/lib/youtube/queries"
import { db } from "@/lib/db"
import {
  hiddenEpisodes,
  episodes as episodesTable,
  episodeOverrides as episodeOverridesTable,
  episodeEnrichments as episodeEnrichmentsTable,
  episodeQuotesConfig as episodeQuotesConfigTable,
} from "@/lib/db/schema"
import { eq, inArray } from "drizzle-orm"
import {
  getCategories as fetchCategories,
  getCategoriesWithCounts as fetchCategoriesWithCounts,
  createCategory as createCat,
  updateCategory as updateCat,
  deleteCategory as deleteCat,
  assignCategoryToEpisode as assignCat,
} from "@/lib/queries/categories"

/* ─── Hidden Episodes Helpers ─── */

export async function getHiddenEpisodeIds(): Promise<string[]> {
  await requireAdmin()
  try {
    const rows = await db!.select({ episode_id: hiddenEpisodes.episode_id }).from(hiddenEpisodes)
    return rows.map(r => r.episode_id)
  } catch {
    return []
  }
}

export async function toggleEpisodeVisibility(episodeId: string) {
  await requireAdmin()
  const existing = await db!.select().from(hiddenEpisodes).where(eq(hiddenEpisodes.episode_id, episodeId)).limit(1)
  const wasHidden = existing.length > 0
  await saveVersion(episodeId, "visibility", { hidden: wasHidden }, wasHidden ? "إظهار الحلقة" : "إخفاء الحلقة")
  if (wasHidden) {
    await db!.delete(hiddenEpisodes).where(eq(hiddenEpisodes.episode_id, episodeId))
  } else {
    await db!.insert(hiddenEpisodes).values({ episode_id: episodeId })
  }
  await invalidateEpisodeCache()
  invalidate("hidden")
  revalidatePath("/")
  revalidatePath("/episodes")
  revalidatePath("/episodes/[slug]", "page")
  revalidatePath("/admin/episodes")
  revalidatePath(`/admin/episodes/${episodeId}`)
  return { success: true }
}

/* ─── Episode Overrides ─── */

export async function updateEpisodeTitle(
  episodeId: string,
  originalTitle: string,
  customTitle: string
) {
  await requireAdmin()
  if (!episodeId || typeof customTitle !== "string") {
    return { success: false, error: "بيانات غير صالحة" }
  }

  const trimmed = customTitle.trim().slice(0, ADMIN_LIMITS.TITLE_LENGTH)
  const overrides = await getEpisodeOverrides()
  const existing = overrides.find((o) => o.id === episodeId)

  // Save version snapshot before change
  await saveVersion(episodeId, "title_override", {
    override: existing || { id: episodeId, originalTitle, customTitle: "", customDescription: "" },
  }, `تعديل العنوان`)

  if (trimmed === "" || trimmed === originalTitle) {
    // Title reset — if there's a description override, keep the entry
    if (existing?.customDescription) {
      existing.customTitle = ""
      existing.originalTitle = ""
      await setEpisodeOverride(existing)
    } else {
      await deleteEpisodeOverride(episodeId)
    }
  } else {
    await setEpisodeOverride({
      id: episodeId,
      originalTitle,
      customTitle: trimmed,
      customDescription: existing?.customDescription,
    })
  }

  await invalidateEpisodeCache()
  invalidate("episodes")
  revalidatePath("/")
  revalidatePath("/episodes")
  revalidatePath("/episodes/[slug]", "page")
  revalidatePath("/admin/episodes")
  revalidatePath(`/admin/episodes/${episodeId}`)

  return { success: true }
}

export async function updateEpisodeDescription(
  episodeId: string,
  customDescription: string
) {
  await requireAdmin()
  if (!episodeId || typeof customDescription !== "string") {
    return { success: false, error: "بيانات غير صالحة" }
  }

  const trimmed = customDescription.trim().slice(0, ADMIN_LIMITS.DESCRIPTION_LENGTH)
  const overrides = await getEpisodeOverrides()
  const existing = overrides.find((o) => o.id === episodeId)

  // Save version snapshot before change
  await saveVersion(episodeId, "description_override", {
    override: existing || { id: episodeId, originalTitle: "", customTitle: "", customDescription: "" },
  }, `تعديل الوصف`)

  if (existing) {
    if (trimmed === "") {
      delete existing.customDescription
    } else {
      existing.customDescription = trimmed
    }
    await setEpisodeOverride(existing)
  } else if (trimmed !== "") {
    // Create a new override entry for description-only edits
    await setEpisodeOverride({
      id: episodeId,
      originalTitle: "",
      customTitle: "",
      customDescription: trimmed,
    })
  }

  await invalidateEpisodeCache()
  invalidate("episodes")
  revalidatePath("/")
  revalidatePath("/episodes")
  revalidatePath("/episodes/[slug]", "page")
  revalidatePath("/admin/episodes")
  revalidatePath(`/admin/episodes/${episodeId}`)

  return { success: true }
}

export async function removeEpisodeOverride(episodeId: string) {
  await requireAdmin()
  await deleteEpisodeOverride(episodeId)

  await invalidateEpisodeCache()
  invalidate("episodes")
  revalidatePath("/")
  revalidatePath("/episodes")
  revalidatePath("/episodes/[slug]", "page")
  revalidatePath("/admin/episodes")
  revalidatePath(`/admin/episodes/${episodeId}`)

  return { success: true }
}

export async function getOverrides() {
  await requireAdmin()
  return getEpisodeOverrides()
}

/* ─── Guest Assignment ─── */

export async function assignEpisodeGuest(
  episodeId: string,
  guestId: string | null
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()
  if (!episodeId) {
    return { success: false, error: "بيانات غير صالحة" }
  }

  // CRITICAL: YouTube-only episodes must be materialized first, otherwise
  // the UPDATE below is a silent no-op (zero rows affected).
  const status = await ensureEpisodeInDb(episodeId)
  if (status === "not-found") {
    console.error(
      `[assignEpisodeGuest] Episode ${episodeId} could not be materialized`,
    )
    return {
      success: false,
      error: "تعذّر العثور على الحلقة في قاعدة البيانات أو في يوتيوب",
    }
  }

  try {
    await saveVersion(
      episodeId,
      "guest_assignment",
      { newGuestId: guestId },
      "تعيين ضيف",
    )
    const rowsUpdated = await assignGuest(episodeId, guestId)
    if (rowsUpdated === 0) {
      console.error(
        `[assignEpisodeGuest] UPDATE affected 0 rows for ${episodeId}`,
      )
      return { success: false, error: "لم يتم حفظ التعديل — لم يتغيّر أي صف" }
    }
  } catch (err) {
    console.error(`[assignEpisodeGuest] Failed for ${episodeId}:`, err)
    return {
      success: false,
      error: (err as Error).message || "فشل تعيين الضيف",
    }
  }

  await invalidateEpisodeCache()
  invalidate("episodes")
  invalidate("guests")
  revalidatePath("/")
  revalidatePath("/episodes")
  revalidatePath("/episodes/[slug]", "page")
  revalidatePath("/guests/[slug]", "page")
  revalidatePath("/admin/episodes")
  revalidatePath(`/admin/episodes/${episodeId}`)
  return { success: true }
}

/* ─── Cache ─── */

export async function invalidateEpisodeCacheAction() {
  await requireAdmin()
  await invalidateEpisodeCache()
  invalidate("all")
  revalidatePath("/")
  revalidatePath("/episodes")
  revalidatePath("/admin/episodes")
  return { success: true }
}

export async function getEpisodeCacheStatusAction() {
  await requireAdmin()
  return getCacheStatus()
}

/* ─── Categories ─── */

export async function getEpisodeCategories() {
  await requireAdmin()
  return fetchCategories()
}

export async function getEpisodeCategoriesWithCounts() {
  await requireAdmin()
  return fetchCategoriesWithCounts()
}

export async function createEpisodeCategory(name: string, slug: string) {
  await requireAdmin()
  if (!name.trim() || !slug.trim()) {
    return { success: false, error: "الاسم والمعرّف مطلوبان" }
  }
  const result = await createCat(name.trim(), slug.trim().toLowerCase())
  if (result.success) {
    revalidatePath("/admin/episodes")
    revalidatePath("/episodes")
    revalidatePath("/")
  }
  return result
}

export async function updateEpisodeCategory(id: string, name: string, slug: string) {
  await requireAdmin()
  if (!id || !name.trim() || !slug.trim()) {
    return { success: false, error: "بيانات غير صالحة" }
  }
  const result = await updateCat(id, name.trim(), slug.trim().toLowerCase())
  if (result.success) {
    revalidatePath("/admin/episodes")
    revalidatePath("/episodes")
    revalidatePath("/")
  }
  return result
}

export async function deleteEpisodeCategory(id: string) {
  await requireAdmin()
  if (!id) return { success: false, error: "بيانات غير صالحة" }
  const result = await deleteCat(id)
  if (result.success) {
    await invalidateEpisodeCache()
    invalidate("episodes")
    revalidatePath("/admin/episodes")
    revalidatePath("/episodes")
    revalidatePath("/")
  }
  return result
}

export async function assignEpisodeCategory(
  episodeId: string,
  categoryId: string | null
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()
  if (!episodeId) return { success: false, error: "بيانات غير صالحة" }

  // CRITICAL: YouTube-only episodes must be materialized first, otherwise
  // the UPDATE below is a silent no-op (zero rows affected).
  const status = await ensureEpisodeInDb(episodeId)
  if (status === "not-found") {
    console.error(
      `[assignEpisodeCategory] Episode ${episodeId} could not be materialized`,
    )
    return {
      success: false,
      error: "تعذّر العثور على الحلقة في قاعدة البيانات أو في يوتيوب",
    }
  }

  try {
    await saveVersion(
      episodeId,
      "category_assignment",
      { newCategoryId: categoryId },
      "تعيين تصنيف",
    )
    const rowsUpdated = await assignCat(episodeId, categoryId)
    if (rowsUpdated === 0) {
      console.error(
        `[assignEpisodeCategory] UPDATE affected 0 rows for ${episodeId}`,
      )
      return { success: false, error: "لم يتم حفظ التعديل — لم يتغيّر أي صف" }
    }
  } catch (err) {
    console.error(`[assignEpisodeCategory] Failed for ${episodeId}:`, err)
    return {
      success: false,
      error: (err as Error).message || "فشل تعيين التصنيف",
    }
  }

  await invalidateEpisodeCache()
  invalidate("episodes")
  revalidatePath("/")
  revalidatePath("/episodes")
  revalidatePath("/episodes/[slug]", "page")
  revalidatePath("/admin/episodes")
  revalidatePath(`/admin/episodes/${episodeId}`)
  return { success: true }
}

/* ─── Delete / Bulk Operations ─── */

/**
 * Delete a single episode. Cleans up all related data in tables that
 * don't have FK cascade (overrides, enrichments, quotes config, hidden)
 * and writes a tombstone to `deleted_episodes` so YouTube-sourced copies
 * can never re-appear.
 *
 * FK-cascaded tables (timestamps, quotes, resources, versions, sponsors)
 * are removed automatically by the DB.
 */
export async function deleteEpisode(episodeId: string): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()
  if (!episodeId || typeof episodeId !== "string") {
    return { success: false, error: "بيانات غير صالحة" }
  }

  const user = await getAdminAuthUser()
  console.info(`[deleteEpisode] Starting delete for ${episodeId} by ${user?.email || "unknown"}`)

  try {
    // Non-FK tables — manual cleanup
    await db!.delete(hiddenEpisodes).where(eq(hiddenEpisodes.episode_id, episodeId))
    await db!.delete(episodeOverridesTable).where(eq(episodeOverridesTable.episode_id, episodeId))
    await db!.delete(episodeEnrichmentsTable).where(eq(episodeEnrichmentsTable.episode_id, episodeId))
    await db!.delete(episodeQuotesConfigTable).where(eq(episodeQuotesConfigTable.episode_id, episodeId))

    // Main row — FK cascades handle timestamps/quotes/resources/versions/sponsors
    const deletedRows = await db!
      .delete(episodesTable)
      .where(eq(episodesTable.id, episodeId))
      .returning({ id: episodesTable.id })
    console.info(
      `[deleteEpisode] Removed ${deletedRows.length} row(s) from episodes table for ${episodeId}`,
    )

    // Tombstone — permanent, always filtered from every query
    await markEpisodesAsDeleted([episodeId], user?.id ?? null)
  } catch (err) {
    console.error(`[deleteEpisode] Failed to delete ${episodeId}:`, err)
    return { success: false, error: (err as Error).message || "فشل حذف الحلقة" }
  }

  await invalidateEpisodeCache()
  invalidate("episodes")
  invalidate("guests")
  invalidate("hidden")
  revalidatePath("/")
  revalidatePath("/episodes")
  revalidatePath("/episodes/[slug]", "page")
  revalidatePath("/guests/[slug]", "page")
  revalidatePath("/admin/episodes")
  console.info(`[deleteEpisode] Completed delete for ${episodeId}`)
  return { success: true }
}

/**
 * Bulk-delete multiple episodes in a single set of DB round-trips.
 * Uses `inArray` for performance with large selections. Writes tombstones
 * for every id so YouTube-sourced copies cannot re-appear.
 */
export async function bulkDeleteEpisodes(
  episodeIds: string[]
): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  await requireAdmin()
  if (!Array.isArray(episodeIds) || episodeIds.length === 0) {
    return { success: false, deletedCount: 0, error: "لم يتم تحديد حلقات" }
  }

  const ids = episodeIds.filter((id) => typeof id === "string" && id.length > 0)
  if (ids.length === 0) {
    return { success: false, deletedCount: 0, error: "بيانات غير صالحة" }
  }

  const user = await getAdminAuthUser()
  console.info(
    `[bulkDeleteEpisodes] Starting bulk delete of ${ids.length} episode(s) by ${user?.email || "unknown"}`,
  )

  let deletedCount = 0
  try {
    await db!.delete(hiddenEpisodes).where(inArray(hiddenEpisodes.episode_id, ids))
    await db!.delete(episodeOverridesTable).where(inArray(episodeOverridesTable.episode_id, ids))
    await db!.delete(episodeEnrichmentsTable).where(inArray(episodeEnrichmentsTable.episode_id, ids))
    await db!.delete(episodeQuotesConfigTable).where(inArray(episodeQuotesConfigTable.episode_id, ids))

    const result = await db!
      .delete(episodesTable)
      .where(inArray(episodesTable.id, ids))
      .returning({ id: episodesTable.id })
    deletedCount = result.length
    console.info(
      `[bulkDeleteEpisodes] Removed ${deletedCount} row(s) from episodes table`,
    )

    // Tombstone all requested ids — even ones that weren't present in the
    // episodes table (they may only exist in YouTube cache).
    await markEpisodesAsDeleted(ids, user?.id ?? null)
  } catch (err) {
    console.error(`[bulkDeleteEpisodes] Failed:`, err)
    return {
      success: false,
      deletedCount,
      error: (err as Error).message || "فشل حذف الحلقات",
    }
  }

  await invalidateEpisodeCache()
  invalidate("episodes")
  invalidate("guests")
  invalidate("hidden")
  revalidatePath("/")
  revalidatePath("/episodes")
  revalidatePath("/episodes/[slug]", "page")
  revalidatePath("/guests/[slug]", "page")
  revalidatePath("/admin/episodes")
  console.info(`[bulkDeleteEpisodes] Completed (${deletedCount} removed, ${ids.length} tombstoned)`)
  return { success: true, deletedCount: ids.length }
}

/**
 * Bulk-assign a category (or clear it, when categoryId is null) for
 * multiple episodes in a single update.
 */
export async function bulkAssignEpisodeCategory(
  episodeIds: string[],
  categoryId: string | null
): Promise<{ success: boolean; count: number; error?: string }> {
  await requireAdmin()
  if (!Array.isArray(episodeIds) || episodeIds.length === 0) {
    return { success: false, count: 0, error: "لم يتم تحديد حلقات" }
  }

  const ids = episodeIds.filter((id) => typeof id === "string" && id.length > 0)
  if (ids.length === 0) {
    return { success: false, count: 0, error: "بيانات غير صالحة" }
  }

  try {
    await db!
      .update(episodesTable)
      .set({ category_id: categoryId })
      .where(inArray(episodesTable.id, ids))
  } catch (err) {
    return { success: false, count: 0, error: (err as Error).message || "فشل نقل الحلقات" }
  }

  await invalidateEpisodeCache()
  invalidate("episodes")
  revalidatePath("/")
  revalidatePath("/episodes")
  revalidatePath("/episodes/[slug]", "page")
  revalidatePath("/admin/episodes")
  return { success: true, count: ids.length }
}

/* ─── Sponsor ─── */

export async function assignEpisodeSponsorAction(
  episodeId: string,
  partnerId: string | null,
  customBrandLine?: string
) {
  await requireAdmin()
  if (!episodeId) {
    return { success: false, error: "بيانات غير صالحة" }
  }

  await setEpisodeSponsor(episodeId, partnerId, customBrandLine)

  await invalidateEpisodeCache()
  invalidate("episodes")
  // episodeId is a UUID, not a slug — invalidate all episode detail pages
  revalidatePath("/episodes/[slug]", "page")
  revalidatePath("/admin/episodes")
  revalidatePath(`/admin/episodes/${episodeId}`)
  return { success: true }
}

/* ─── YouTube Import (safe, date-scoped) ─── */

export type ImportSkippedReason = "existing" | "tombstoned"

export interface ImportSkippedItem {
  videoId: string
  title: string
  publishedAt: string
  reason: ImportSkippedReason
}

export interface ImportedItem {
  videoId: string
  title: string
  publishedAt: string
}

export interface ImportEpisodesResult {
  success: boolean
  error?: string
  from: string
  to: string | null
  totalFromYouTube: number
  totalInDateRange: number
  imported: ImportedItem[]
  skippedExisting: ImportSkippedItem[]
  skippedTombstoned: ImportSkippedItem[]
}

/**
 * Safe, date-scoped YouTube → DB import.
 *
 * Unlike the "Full Sync" (refresh cache) button, this action NEVER touches
 * episodes that are:
 *   - Already present in the DB (deduped by videoId = episode.id)
 *   - Present in the tombstone table (permanently deleted)
 *
 * It ONLY inserts new rows for YouTube videos inside the requested date
 * range that the admin has not previously deleted.
 */
export async function importEpisodesFromYouTube(input: {
  from: string
  to?: string | null
}): Promise<ImportEpisodesResult> {
  await requireAdmin()

  const fromRaw = String(input?.from || "").trim()
  const toRaw = input?.to ? String(input.to).trim() : ""

  // Validate dates
  const fromDate = new Date(fromRaw)
  if (!fromRaw || Number.isNaN(fromDate.getTime())) {
    return {
      success: false,
      error: "تاريخ البداية غير صالح",
      from: fromRaw,
      to: toRaw || null,
      totalFromYouTube: 0,
      totalInDateRange: 0,
      imported: [],
      skippedExisting: [],
      skippedTombstoned: [],
    }
  }

  let toDate: Date | null = null
  if (toRaw) {
    toDate = new Date(toRaw)
    if (Number.isNaN(toDate.getTime())) {
      return {
        success: false,
        error: "تاريخ النهاية غير صالح",
        from: fromRaw,
        to: toRaw,
        totalFromYouTube: 0,
        totalInDateRange: 0,
        imported: [],
        skippedExisting: [],
        skippedTombstoned: [],
      }
    }
    // Include the full `to` day: push to end of day
    toDate.setHours(23, 59, 59, 999)
    if (toDate.getTime() < fromDate.getTime()) {
      return {
        success: false,
        error: "تاريخ النهاية يجب أن يكون بعد تاريخ البداية",
        from: fromRaw,
        to: toRaw,
        totalFromYouTube: 0,
        totalInDateRange: 0,
        imported: [],
        skippedExisting: [],
        skippedTombstoned: [],
      }
    }
  }

  console.info(
    `[importEpisodesFromYouTube] from=${fromRaw} to=${toRaw || "(open)"}`,
  )

  // Fetch directly from YouTube (bypassing the cached list so imports are
  // never based on stale data)
  let ytEpisodes: Awaited<ReturnType<typeof ytFetchAll>>
  try {
    ytEpisodes = await ytFetchAll()
  } catch (err) {
    console.error("[importEpisodesFromYouTube] YouTube fetch failed:", err)
    return {
      success: false,
      error: (err as Error).message || "فشل جلب الحلقات من يوتيوب",
      from: fromRaw,
      to: toRaw || null,
      totalFromYouTube: 0,
      totalInDateRange: 0,
      imported: [],
      skippedExisting: [],
      skippedTombstoned: [],
    }
  }

  // Date-scope the candidates
  const fromMs = fromDate.getTime()
  const toMs = toDate ? toDate.getTime() : null
  const inRange = ytEpisodes.filter((ep) => {
    const epMs = new Date(ep.release_date).getTime()
    if (Number.isNaN(epMs)) return false
    if (epMs < fromMs) return false
    if (toMs !== null && epMs > toMs) return false
    return true
  })

  console.info(
    `[importEpisodesFromYouTube] Fetched ${ytEpisodes.length} total, ${inRange.length} in range`,
  )

  // Load dedup sources in parallel — we need IDs (dedup key) AND slugs
  // (unique constraint) to avoid insert conflicts
  const [existingRows, deletedSet] = await Promise.all([
    db!.select({ id: episodesTable.id, slug: episodesTable.slug }).from(episodesTable),
    getDeletedEpisodeIds(),
  ])
  const existingSet = new Set(existingRows.map((r) => r.id))
  const takenSlugs = new Set(existingRows.map((r) => r.slug))

  const imported: ImportedItem[] = []
  const skippedExisting: ImportSkippedItem[] = []
  const skippedTombstoned: ImportSkippedItem[] = []
  const toInsert: Array<typeof episodesTable.$inferInsert> = []

  for (const ep of inRange) {
    const meta = {
      videoId: ep.id,
      title: ep.title,
      publishedAt: ep.release_date,
    }

    // CRITICAL: tombstoned episodes are never re-imported
    if (deletedSet.has(ep.id)) {
      skippedTombstoned.push({ ...meta, reason: "tombstoned" })
      continue
    }

    if (existingSet.has(ep.id)) {
      skippedExisting.push({ ...meta, reason: "existing" })
      continue
    }

    // Uniquify slug against existing rows AND this batch. The unique
    // constraint on episodes.slug would otherwise fail the whole insert.
    let slug = ep.slug || ep.id
    if (takenSlugs.has(slug)) {
      const suffix = ep.id.slice(0, 6).toLowerCase()
      slug = `${slug}-${suffix}`
      let n = 2
      while (takenSlugs.has(slug)) {
        slug = `${ep.slug || ep.id}-${suffix}-${n++}`
      }
    }
    takenSlugs.add(slug)

    toInsert.push({
      id: ep.id, // videoId is the primary key — the dedup key
      title: ep.title,
      slug,
      description: ep.description || null,
      youtube_url: ep.youtube_url,
      duration_minutes: ep.duration_minutes || 0,
      release_date: ep.release_date,
      episode_number: ep.episode_number ?? null,
      season: ep.season ?? null,
      thumbnail_url: ep.thumbnail_url || null,
      status: "published",
      featured: false,
      view_count: ep.view_count ?? 0,
    })
    imported.push(meta)
  }

  // Bulk insert (ON CONFLICT DO NOTHING handles any race)
  if (toInsert.length > 0) {
    try {
      await db!
        .insert(episodesTable)
        .values(toInsert)
        .onConflictDoNothing({ target: episodesTable.id })
    } catch (err) {
      console.error("[importEpisodesFromYouTube] Insert failed:", err)
      return {
        success: false,
        error: (err as Error).message || "فشل إدراج الحلقات الجديدة",
        from: fromRaw,
        to: toRaw || null,
        totalFromYouTube: ytEpisodes.length,
        totalInDateRange: inRange.length,
        imported: [],
        skippedExisting,
        skippedTombstoned,
      }
    }
  }

  await invalidateEpisodeCache()
  invalidate("episodes")
  revalidatePath("/")
  revalidatePath("/episodes")
  revalidatePath("/admin/episodes")

  console.info(
    `[importEpisodesFromYouTube] Done — imported=${imported.length} existing=${skippedExisting.length} tombstoned=${skippedTombstoned.length}`,
  )

  return {
    success: true,
    from: fromRaw,
    to: toRaw || null,
    totalFromYouTube: ytEpisodes.length,
    totalInDateRange: inRange.length,
    imported,
    skippedExisting,
    skippedTombstoned,
  }
}

/**
 * Restore one or more tombstoned episodes. Removes them from the
 * `deleted_episodes` table — the next YouTube refresh / import will be
 * allowed to bring them back.
 */
export async function restoreEpisodesFromTombstone(
  episodeIds: string[],
): Promise<{ success: boolean; restoredCount: number; error?: string }> {
  await requireAdmin()
  if (!Array.isArray(episodeIds) || episodeIds.length === 0) {
    return { success: false, restoredCount: 0, error: "لم يتم تحديد حلقات" }
  }
  try {
    const count = await restoreDeletedEpisodes(episodeIds)
    await invalidateEpisodeCache()
    invalidate("episodes")
    revalidatePath("/")
    revalidatePath("/episodes")
    revalidatePath("/admin/episodes")
    return { success: true, restoredCount: count }
  } catch (err) {
    return {
      success: false,
      restoredCount: 0,
      error: (err as Error).message || "فشل استعادة الحلقات",
    }
  }
}

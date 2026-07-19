import { unlink } from "fs/promises"
import path from "path"
import { createConfigStore } from "@/lib/config-store"
import { db, USE_DB } from "@/lib/db"
import { teasers, teaserQuestions } from "@/lib/db/schema"
import { episodeIntelligenceRecords } from "@/lib/db/schema/eir"
import { guests } from "@/lib/db/schema/guests"
import { eq, desc, sql, notInArray } from "drizzle-orm"
import type { EpisodePhase } from "@/lib/db/schema/eir"
import type { TeaserConfig, TeaserSettings, TeaserQuestion, TeaserQuestionStats } from "@/types/teaser"

const TEASERS_DIR = path.join(process.cwd(), "public", "teasers")

/**
 * Cache tag for the homepage's active-teaser fetch (unstable_cache). Every
 * mutation path — admin actions AND episode publish — must revalidateTag this
 * so the teaser appears/disappears without waiting for the cache to age out
 * (acceptance م4 / Sara note 14).
 */
export const TEASER_CACHE_TAG = "active-teaser"

const store = createConfigStore<TeaserSettings>("teaser.json", { teasers: [] })

// DB row → app type
function rowToTeaser(row: Record<string, unknown>): TeaserConfig {
  return {
    id: row.id as string,
    eirId: (row.eir_id as string) || null,
    guestId: (row.guest_id as string) || null,
    // guest_name is nullable — coerce empty/missing to null so public readers
    // can reliably hide the guest line (never render "null").
    guestName: (row.guest_name as string) || null,
    title: row.title as string,
    prompt: row.prompt as string,
    videoFilename: row.video_filename as string,
    posterImage: (row.poster_image as string) || null,
    isActive: row.is_active as boolean,
    publishAt: (row.publish_at as string) || null,
    expireAt: (row.expire_at as string) || null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

// ─── Config Read/Write ──────────────────────────────────────────

export async function getTeaserSettings(): Promise<TeaserSettings> {
  if (USE_DB) {
    try {
      const rows = await db!.select().from(teasers).orderBy(desc(teasers.created_at))
      return { teasers: rows.map((r) => rowToTeaser(r as unknown as Record<string, unknown>)) }
    } catch (e) {
      console.error("getTeaserSettings DB exception:", e)
    }
  }
  return store.read()
}

async function saveSettings(settings: TeaserSettings): Promise<void> {
  await store.write(settings)
}

// ─── Teaser CRUD ────────────────────────────────────────────────

/**
 * Whether a teaser's publish/expire window contains `now`. Pure (no active
 * flag, no DB) so the window rule (acceptance م2) is unit-testable and shared
 * by every read path.
 */
export function isTeaserWithinWindow(
  t: { publishAt: string | null; expireAt: string | null },
  now: Date = new Date(),
): boolean {
  if (t.publishAt && new Date(t.publishAt) > now) return false
  if (t.expireAt && new Date(t.expireAt) < now) return false
  return true
}

export async function createTeaser(data: {
  eirId?: string | null
  guestId?: string | null
  guestName?: string | null
  title: string
  prompt?: string
  videoFilename: string
  posterImage?: string | null
  publishAt?: string | null
  expireAt?: string | null
}): Promise<TeaserConfig> {
  const now = new Date().toISOString()

  const teaser: TeaserConfig = {
    id: `teaser-${crypto.randomUUID()}`,
    eirId: data.eirId ?? null,
    guestId: data.guestId ?? null,
    guestName: data.guestName ?? null,
    title: data.title,
    // prompt stays dormant in v1 (questions are out of scope); keep the legacy
    // default so the NOT NULL column is always satisfied.
    prompt: data.prompt || "اكتب سؤالك للضيف",
    videoFilename: data.videoFilename,
    posterImage: data.posterImage ?? null,
    isActive: false,
    publishAt: data.publishAt ?? null,
    expireAt: data.expireAt ?? null,
    createdAt: now,
    updatedAt: now,
  }

  if (USE_DB) {
    try {
      const rows = await db!.insert(teasers).values({
        id: teaser.id,
        eir_id: teaser.eirId,
        guest_id: teaser.guestId,
        guest_name: teaser.guestName,
        title: teaser.title,
        prompt: teaser.prompt,
        video_filename: teaser.videoFilename,
        poster_image: teaser.posterImage,
        is_active: teaser.isActive,
        publish_at: teaser.publishAt,
        expire_at: teaser.expireAt,
      }).returning()
      if (rows[0]) return rowToTeaser(rows[0] as unknown as Record<string, unknown>)
    } catch (e) {
      console.error("createTeaser DB exception:", e)
    }
  }

  const settings = await store.read()
  settings.teasers.push(teaser)
  await saveSettings(settings)
  return teaser
}

export async function updateTeaser(
  id: string,
  updates: Partial<Omit<TeaserConfig, "id" | "createdAt">>
): Promise<TeaserConfig | null> {
  if (USE_DB) {
    try {
      const dbUpdates: Record<string, unknown> = {}
      if (updates.eirId !== undefined) dbUpdates.eir_id = updates.eirId
      if (updates.guestId !== undefined) dbUpdates.guest_id = updates.guestId
      if (updates.guestName !== undefined) dbUpdates.guest_name = updates.guestName
      if (updates.title !== undefined) dbUpdates.title = updates.title
      if (updates.prompt !== undefined) dbUpdates.prompt = updates.prompt
      if (updates.videoFilename !== undefined) dbUpdates.video_filename = updates.videoFilename
      if (updates.posterImage !== undefined) dbUpdates.poster_image = updates.posterImage
      if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive
      if (updates.publishAt !== undefined) dbUpdates.publish_at = updates.publishAt
      if (updates.expireAt !== undefined) dbUpdates.expire_at = updates.expireAt

      if (Object.keys(dbUpdates).length === 0) return null

      const rows = await db!.update(teasers)
        .set(dbUpdates)
        .where(eq(teasers.id, id))
        .returning()
      if (rows[0]) return rowToTeaser(rows[0] as unknown as Record<string, unknown>)
      return null
    } catch (e) {
      console.error("updateTeaser DB exception:", e)
    }
  }

  const settings = await store.read()
  const index = settings.teasers.findIndex((t) => t.id === id)
  if (index === -1) return null

  settings.teasers[index] = {
    ...settings.teasers[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  }
  await saveSettings(settings)
  return settings.teasers[index]
}

export async function deleteTeaser(id: string): Promise<boolean> {
  // Get teaser first to know the video filename
  let videoFilename: string | null = null

  if (USE_DB) {
    try {
      const teaserRows = await db!.select({ video_filename: teasers.video_filename }).from(teasers).where(eq(teasers.id, id)).limit(1)
      if (teaserRows[0]) videoFilename = teaserRows[0].video_filename as string

      const result = await db!.delete(teasers).where(eq(teasers.id, id))

      if ((result.rowCount ?? 0) > 0) {
        // Delete video file
        if (videoFilename) {
          try { await unlink(path.join(TEASERS_DIR, videoFilename)) } catch { /* ok */ }
        }
        return true
      }
      return false
    } catch (e) {
      console.error("deleteTeaser DB exception:", e)
    }
  }

  const settings = await store.read()
  const teaser = settings.teasers.find((t) => t.id === id)
  if (!teaser) return false

  // Delete video file
  if (teaser.videoFilename) {
    try { await unlink(path.join(TEASERS_DIR, teaser.videoFilename)) } catch { /* ok */ }
  }

  settings.teasers = settings.teasers.filter((t) => t.id !== id)
  await saveSettings(settings)
  return true
}

export async function activateTeaser(id: string): Promise<boolean> {
  if (USE_DB) {
    try {
      // Deactivate all
      await db!.update(teasers).set({ is_active: false })
      // Activate target
      const result = await db!.update(teasers).set({ is_active: true }).where(eq(teasers.id, id))
      return (result.rowCount ?? 0) > 0
    } catch (e) {
      console.error("activateTeaser DB exception:", e)
    }
  }

  const settings = await store.read()
  const index = settings.teasers.findIndex((t) => t.id === id)
  if (index === -1) return false

  // Deactivate all others
  for (const t of settings.teasers) {
    t.isActive = false
  }

  settings.teasers[index].isActive = true
  settings.teasers[index].updatedAt = new Date().toISOString()
  await saveSettings(settings)
  return true
}

export async function deactivateTeaser(id: string): Promise<boolean> {
  if (USE_DB) {
    try {
      const result = await db!.update(teasers).set({ is_active: false }).where(eq(teasers.id, id))
      return (result.rowCount ?? 0) > 0
    } catch (e) {
      console.error("deactivateTeaser DB exception:", e)
    }
  }

  const settings = await store.read()
  const index = settings.teasers.findIndex((t) => t.id === id)
  if (index === -1) return false

  settings.teasers[index].isActive = false
  settings.teasers[index].updatedAt = new Date().toISOString()
  await saveSettings(settings)
  return true
}

// ─── Question Queries (pool) ─────────────────────────────────────

export async function getApprovedQuestions(teaserId: string): Promise<TeaserQuestion[]> {
  if (!db) return []
  try {
    const rows = await db.select().from(teaserQuestions)
      .where(sql`${teaserQuestions.teaser_id} = ${teaserId} AND ${teaserQuestions.status} = 'approved'`)
      .orderBy(desc(teaserQuestions.created_at))
    return rows as unknown as TeaserQuestion[]
  } catch (e) {
    console.error("Error fetching approved questions:", e)
    return []
  }
}

export async function getPendingQuestions(teaserId: string): Promise<TeaserQuestion[]> {
  if (!db) return []
  try {
    const rows = await db.select().from(teaserQuestions)
      .where(sql`${teaserQuestions.teaser_id} = ${teaserId} AND ${teaserQuestions.status} = 'pending'`)
      .orderBy(desc(teaserQuestions.created_at))
    return rows as unknown as TeaserQuestion[]
  } catch (e) {
    console.error("Error fetching pending questions:", e)
    return []
  }
}

export async function getAllQuestions(teaserId: string): Promise<TeaserQuestion[]> {
  if (!db) return []
  try {
    const rows = await db.select().from(teaserQuestions)
      .where(eq(teaserQuestions.teaser_id, teaserId))
      .orderBy(desc(teaserQuestions.created_at))
    return rows as unknown as TeaserQuestion[]
  } catch (e) {
    console.error("Error fetching questions:", e)
    return []
  }
}

export async function updateQuestionStatus(
  questionId: string,
  status: "approved" | "rejected"
): Promise<boolean> {
  if (!db) return false
  try {
    await db.update(teaserQuestions).set({ status }).where(eq(teaserQuestions.id, questionId))
    return true
  } catch (e) {
    console.error("Error updating question status:", e)
    return false
  }
}

export async function deleteQuestion(questionId: string): Promise<boolean> {
  if (!db) return false
  try {
    await db.delete(teaserQuestions).where(eq(teaserQuestions.id, questionId))
    return true
  } catch (e) {
    console.error("Error deleting question:", e)
    return false
  }
}

export async function getTeaserQuestionStats(teaserId: string): Promise<TeaserQuestionStats> {
  if (!db) return { total: 0, pending: 0, approved: 0, rejected: 0 }
  try {
    const result = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
        COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected
      FROM teaser_questions WHERE teaser_id = ${teaserId}
    `)
    const row = result.rows[0] as unknown as TeaserQuestionStats | undefined
    return row ?? { total: 0, pending: 0, approved: 0, rejected: 0 }
  } catch (e) {
    console.error("Error fetching question stats:", e)
    return { total: 0, pending: 0, approved: 0, rejected: 0 }
  }
}

// ─── EIR linking (admin teaser tab) ──────────────────────────────
// A teaser links to an UPCOMING episode. "Upcoming" = an EIR whose phase is
// before `published` (Sara note 15: the picker excludes published and later).

const PUBLISHED_OR_LATER: EpisodePhase[] = [
  "published",
  "analyzing",
  "learned",
  "archived",
]

export interface UpcomingEpisodeOption {
  eirId: string
  title: string
  phase: EpisodePhase
  guestId: string | null
  guestName: string | null
}

/** Picker options for the admin teaser tab — every EIR before publish. */
export async function getUpcomingEpisodesForTeaser(): Promise<UpcomingEpisodeOption[]> {
  if (!db) return []
  try {
    const rows = await db
      .select({
        eirId: episodeIntelligenceRecords.id,
        workingTitle: episodeIntelligenceRecords.working_title,
        finalTitle: episodeIntelligenceRecords.final_title,
        phase: episodeIntelligenceRecords.phase,
        guestId: episodeIntelligenceRecords.guest_id,
        guestName: guests.name,
      })
      .from(episodeIntelligenceRecords)
      .leftJoin(guests, eq(guests.id, episodeIntelligenceRecords.guest_id))
      .where(notInArray(episodeIntelligenceRecords.phase, PUBLISHED_OR_LATER))
      .orderBy(desc(episodeIntelligenceRecords.updated_at))
    return rows.map((r) => ({
      eirId: r.eirId,
      title: r.finalTitle || r.workingTitle,
      phase: r.phase as EpisodePhase,
      guestId: r.guestId ?? null,
      guestName: r.guestName ?? null,
    }))
  } catch (e) {
    console.error("getUpcomingEpisodesForTeaser exception:", e)
    return []
  }
}

/** Public-display shape for the active teaser (homepage/episode/guest). */
export interface ActiveTeaserView {
  id: string
  title: string
  guestName: string | null
  videoFilename: string
  posterImage: string | null
  eirId: string
  guestId: string | null
}

/**
 * The teaser to show on the public HOMEPAGE, or null.
 *
 * A teaser shows only while its linked episode is still upcoming: it is active,
 * inside its publish/expire window, linked to an EIR, and that EIR is BEFORE
 * `published`. The moment the episode publishes, this returns null so the
 * teaser disappears from the homepage (acceptance م4) and lives on instead on
 * the episode/guest pages. Cache invalidation on publish (Sara note 14) is what
 * makes the transition immediate.
 */
export async function getActiveTeaserForDisplay(): Promise<ActiveTeaserView | null> {
  if (!db) return null
  const now = new Date()
  try {
    const rows = await db
      .select()
      .from(teasers)
      .where(eq(teasers.is_active, true))
      .orderBy(desc(teasers.created_at))
    const active = rows.find((t) =>
      isTeaserWithinWindow({ publishAt: t.publish_at, expireAt: t.expire_at }, now),
    )
    if (!active || !active.eir_id) return null // orphaned teaser has no episode

    const eirRows = await db
      .select({ phase: episodeIntelligenceRecords.phase })
      .from(episodeIntelligenceRecords)
      .where(eq(episodeIntelligenceRecords.id, active.eir_id))
      .limit(1)
    const phase = eirRows[0]?.phase as EpisodePhase | undefined
    if (!phase || PUBLISHED_OR_LATER.includes(phase)) return null // published → off homepage

    return {
      id: active.id,
      title: active.title,
      guestName: active.guest_name || null,
      videoFilename: active.video_filename,
      posterImage: active.poster_image || null,
      eirId: active.eir_id,
      guestId: active.guest_id || null,
    }
  } catch (e) {
    console.error("getActiveTeaserForDisplay exception:", e)
    return null
  }
}

function rowToActiveView(t: typeof teasers.$inferSelect): ActiveTeaserView | null {
  if (!t.eir_id) return null
  return {
    id: t.id,
    title: t.title,
    guestName: t.guest_name || null,
    videoFilename: t.video_filename,
    posterImage: t.poster_image || null,
    eirId: t.eir_id,
    guestId: t.guest_id || null,
  }
}

/**
 * Teaser to show (archived) on a published episode's page, linked by EIR.
 * Unlike the homepage, this ignores phase/active/window — once the episode is
 * live the teaser lives on as an archive block (acceptance م4). Newest wins.
 */
export async function getTeaserForEpisode(eirId: string | null): Promise<ActiveTeaserView | null> {
  if (!db || !eirId) return null
  try {
    const rows = await db
      .select()
      .from(teasers)
      .where(eq(teasers.eir_id, eirId))
      .orderBy(desc(teasers.created_at))
      .limit(1)
    return rows[0] ? rowToActiveView(rows[0]) : null
  } catch (e) {
    console.error("getTeaserForEpisode exception:", e)
    return null
  }
}

/** Teaser to show (archived) on a guest's page, linked by guest_id. */
export async function getTeaserForGuest(guestId: string | null): Promise<ActiveTeaserView | null> {
  if (!db || !guestId) return null
  try {
    const rows = await db
      .select()
      .from(teasers)
      .where(eq(teasers.guest_id, guestId))
      .orderBy(desc(teasers.created_at))
      .limit(1)
    return rows[0] ? rowToActiveView(rows[0]) : null
  } catch (e) {
    console.error("getTeaserForGuest exception:", e)
    return null
  }
}

/**
 * Server-side snapshot for teaser creation: validates the EIR is a real
 * upcoming episode and returns the canonical title + guest, so the guest name
 * is locked from the EIR (never free-typed — Sara note 7). Returns null if the
 * EIR doesn't exist or is already published.
 */
export async function resolveTeaserEirSnapshot(
  eirId: string,
): Promise<{ title: string; guestId: string | null; guestName: string | null } | null> {
  if (!db) return null
  try {
    const rows = await db
      .select({
        workingTitle: episodeIntelligenceRecords.working_title,
        finalTitle: episodeIntelligenceRecords.final_title,
        phase: episodeIntelligenceRecords.phase,
        guestId: episodeIntelligenceRecords.guest_id,
        guestName: guests.name,
      })
      .from(episodeIntelligenceRecords)
      .leftJoin(guests, eq(guests.id, episodeIntelligenceRecords.guest_id))
      .where(eq(episodeIntelligenceRecords.id, eirId))
      .limit(1)
    const r = rows[0]
    if (!r) return null
    if (PUBLISHED_OR_LATER.includes(r.phase as EpisodePhase)) return null
    return {
      title: r.finalTitle || r.workingTitle,
      guestId: r.guestId ?? null,
      guestName: r.guestName ?? null,
    }
  } catch (e) {
    console.error("resolveTeaserEirSnapshot exception:", e)
    return null
  }
}

import { unlink } from "fs/promises"
import path from "path"
import { createConfigStore } from "@/lib/config-store"
import { db, USE_DB } from "@/lib/db"
import { teasers, teaserQuestions } from "@/lib/db/schema"
import { eq, desc, sql } from "drizzle-orm"
import type { TeaserConfig, TeaserSettings, TeaserQuestion, TeaserQuestionStats } from "@/types/teaser"

const TEASERS_DIR = path.join(process.cwd(), "public", "teasers")

const store = createConfigStore<TeaserSettings>("teaser.json", { teasers: [] })

// DB row → app type
function rowToTeaser(row: Record<string, unknown>): TeaserConfig {
  return {
    id: row.id as string,
    guestName: row.guest_name as string,
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

export async function getActiveTeaser(): Promise<{ teaser: TeaserConfig; questions: TeaserQuestion[] } | null> {
  const settings = await getTeaserSettings()
  const now = new Date()

  const active = settings.teasers.find((t) => {
    if (!t.isActive) return false
    if (t.publishAt && new Date(t.publishAt) > now) return false
    if (t.expireAt && new Date(t.expireAt) < now) return false
    return true
  })

  if (!active) return null

  const questions = await getApprovedQuestions(active.id)
  return { teaser: active, questions }
}

export async function createTeaser(data: {
  guestName: string
  title: string
  prompt: string
  videoFilename: string
  posterImage?: string | null
  publishAt?: string | null
  expireAt?: string | null
}): Promise<TeaserConfig> {
  const now = new Date().toISOString()

  const teaser: TeaserConfig = {
    id: `teaser-${crypto.randomUUID()}`,
    guestName: data.guestName,
    title: data.title || "اسأل الضيف",
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

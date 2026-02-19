import { unlink } from "fs/promises"
import path from "path"
import { createClient } from "@/lib/supabase/server"
import { createConfigStore } from "@/lib/config-store"
import { pool, USE_DB } from "@/lib/db"
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
      const { rows } = await pool!.query(
        `SELECT * FROM teasers ORDER BY created_at DESC`
      )
      return { teasers: rows.map(rowToTeaser) }
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
      const { rows } = await pool!.query(
        `INSERT INTO teasers (id, guest_name, title, prompt, video_filename, poster_image, is_active, publish_at, expire_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [teaser.id, teaser.guestName, teaser.title, teaser.prompt, teaser.videoFilename, teaser.posterImage, teaser.isActive, teaser.publishAt, teaser.expireAt]
      )
      if (rows[0]) return rowToTeaser(rows[0])
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

      const fields: string[] = []
      const values: unknown[] = []
      let paramIndex = 1

      for (const [key, value] of Object.entries(dbUpdates)) {
        fields.push(`${key} = $${paramIndex}`)
        values.push(value)
        paramIndex++
      }

      if (fields.length === 0) return null
      values.push(id)

      const { rows } = await pool!.query(
        `UPDATE teasers SET ${fields.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
        values
      )
      if (rows[0]) return rowToTeaser(rows[0])
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
      const { rows: teaserRows } = await pool!.query(
        `SELECT video_filename FROM teasers WHERE id = $1 LIMIT 1`,
        [id]
      )
      if (teaserRows[0]) videoFilename = teaserRows[0].video_filename as string

      const { rowCount } = await pool!.query(
        `DELETE FROM teasers WHERE id = $1`,
        [id]
      )

      if ((rowCount ?? 0) > 0) {
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
      await pool!.query(`UPDATE teasers SET is_active = false`)
      // Activate target
      const { rowCount } = await pool!.query(
        `UPDATE teasers SET is_active = true WHERE id = $1`,
        [id]
      )
      return (rowCount ?? 0) > 0
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
      const { rowCount } = await pool!.query(
        `UPDATE teasers SET is_active = false WHERE id = $1`,
        [id]
      )
      return (rowCount ?? 0) > 0
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

// ─── Question Queries (Supabase — Hibr auth) ────────────────────

export async function getApprovedQuestions(teaserId: string): Promise<TeaserQuestion[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("teaser_questions")
    .select("id, teaser_id, display_name, question_text, status, ip_hash, created_at")
    .eq("teaser_id", teaserId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching approved questions:", error)
    return []
  }
  return data ?? []
}

export async function getPendingQuestions(teaserId: string): Promise<TeaserQuestion[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("teaser_questions")
    .select("id, teaser_id, display_name, question_text, status, ip_hash, created_at")
    .eq("teaser_id", teaserId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching pending questions:", error)
    return []
  }
  return data ?? []
}

export async function getAllQuestions(teaserId: string): Promise<TeaserQuestion[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("teaser_questions")
    .select("id, teaser_id, display_name, question_text, status, ip_hash, created_at")
    .eq("teaser_id", teaserId)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching questions:", error)
    return []
  }
  return data ?? []
}

export async function updateQuestionStatus(
  questionId: string,
  status: "approved" | "rejected"
): Promise<boolean> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("teaser_questions")
    .update({ status })
    .eq("id", questionId)

  if (error) {
    console.error("Error updating question status:", error)
    return false
  }
  return true
}

export async function deleteQuestion(questionId: string): Promise<boolean> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("teaser_questions")
    .delete()
    .eq("id", questionId)

  if (error) {
    console.error("Error deleting question:", error)
    return false
  }
  return true
}

export async function getTeaserQuestionStats(teaserId: string): Promise<TeaserQuestionStats> {
  const supabase = await createClient()

  const [total, pending, approved, rejected] = await Promise.all([
    supabase.from("teaser_questions").select("*", { count: "exact", head: true }).eq("teaser_id", teaserId),
    supabase.from("teaser_questions").select("*", { count: "exact", head: true }).eq("teaser_id", teaserId).eq("status", "pending"),
    supabase.from("teaser_questions").select("*", { count: "exact", head: true }).eq("teaser_id", teaserId).eq("status", "approved"),
    supabase.from("teaser_questions").select("*", { count: "exact", head: true }).eq("teaser_id", teaserId).eq("status", "rejected"),
  ])

  return {
    total: total.count ?? 0,
    pending: pending.count ?? 0,
    approved: approved.count ?? 0,
    rejected: rejected.count ?? 0,
  }
}

import { db } from "@/lib/db"
import { episodeVersions } from "@/lib/db/schema"
import { eq, desc, sql } from "drizzle-orm"
import type { EpisodeVersion, EpisodeVersionChangeType } from "@/types/database"

export async function saveVersion(
  episodeId: string,
  changeType: EpisodeVersionChangeType,
  snapshot: Record<string, unknown>,
  summary?: string
): Promise<EpisodeVersion> {
  if (!db) throw new Error("Database not available")

  // Auto-increment version number for this episode via subquery
  const maxResult = await db
    .select({ max: sql<number>`coalesce(max(${episodeVersions.version_number}), 0)` })
    .from(episodeVersions)
    .where(eq(episodeVersions.episode_id, episodeId))
  const nextVersion = (maxResult[0]?.max ?? 0) + 1

  try {
    const rows = await db.insert(episodeVersions).values({
      id: `ver-${crypto.randomUUID()}`,
      episode_id: episodeId,
      version_number: nextVersion,
      change_type: changeType,
      change_summary: summary || null,
      snapshot,
      created_by: "admin",
    }).returning()

    return rows[0] as unknown as EpisodeVersion
  } catch (err) {
    // YouTube-only episodes have no row in the episodes table,
    // so the foreign key constraint fails. Log and return a stub.
    console.warn(`[saveVersion] Skipped for ${episodeId} (${changeType}):`, (err as Error).message?.slice(0, 100))
    return {
      id: `ver-skipped-${crypto.randomUUID()}`,
      episode_id: episodeId,
      version_number: nextVersion,
      change_type: changeType,
      change_summary: summary || null,
      snapshot,
      created_by: "admin",
      created_at: new Date().toISOString(),
    } as unknown as EpisodeVersion
  }
}

export async function getVersionHistory(
  episodeId: string,
  limit: number = 20
): Promise<EpisodeVersion[]> {
  if (!db) return []

  const rows = await db.select().from(episodeVersions)
    .where(eq(episodeVersions.episode_id, episodeId))
    .orderBy(desc(episodeVersions.created_at))
    .limit(limit)
  return rows as unknown as EpisodeVersion[]
}

export async function getVersion(versionId: string): Promise<EpisodeVersion | null> {
  if (!db) return null

  const rows = await db.select().from(episodeVersions)
    .where(eq(episodeVersions.id, versionId))
    .limit(1)
  if (rows[0]) return rows[0] as unknown as EpisodeVersion
  return null
}

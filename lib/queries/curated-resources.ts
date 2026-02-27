import { db, USE_DB } from "@/lib/db"
import { curatedResources } from "@/lib/db/schema"
import { eq, desc, sql, ne, and } from "drizzle-orm"

export type CuratedResource = typeof curatedResources.$inferSelect
export type NewCuratedResource = typeof curatedResources.$inferInsert

export async function getApprovedResources(): Promise<CuratedResource[]> {
  if (USE_DB) {
    try {
      return await db!.select().from(curatedResources)
        .where(eq(curatedResources.status, "approved"))
        .orderBy(desc(curatedResources.approved_at))
    } catch (e) {
      console.error("getApprovedResources DB exception:", e)
    }
  }
  return []
}

export async function getCuratedResources(status?: string): Promise<CuratedResource[]> {
  if (USE_DB) {
    try {
      const query = db!.select().from(curatedResources)
      if (status === "deleted") {
        return await query.where(eq(curatedResources.status, "deleted")).orderBy(desc(curatedResources.updated_at))
      }
      if (status) {
        return await query.where(eq(curatedResources.status, status)).orderBy(desc(curatedResources.created_at))
      }
      // Default "all" excludes deleted
      return await query.where(ne(curatedResources.status, "deleted")).orderBy(desc(curatedResources.created_at))
    } catch (e) {
      console.error("getCuratedResources DB exception:", e)
    }
  }
  return []
}

export async function insertCuratedResources(resources: NewCuratedResource[]): Promise<CuratedResource[]> {
  if (!USE_DB || resources.length === 0) return []
  try {
    return await db!.insert(curatedResources).values(resources).returning()
  } catch (e) {
    console.error("insertCuratedResources DB exception:", e)
    return []
  }
}

export async function updateCuratedResource(
  id: string,
  data: Partial<Omit<NewCuratedResource, "id" | "created_at">>
): Promise<CuratedResource | null> {
  if (USE_DB) {
    try {
      const rows = await db!.update(curatedResources)
        .set({ ...data, updated_at: new Date() })
        .where(eq(curatedResources.id, id))
        .returning()
      return rows[0] ?? null
    } catch (e) {
      console.error("updateCuratedResource DB exception:", e)
    }
  }
  return null
}

export async function getExistingResourceTitles(): Promise<string[]> {
  if (USE_DB) {
    try {
      const rows = await db!.select({ title: curatedResources.title }).from(curatedResources)
      return rows.map((r) => r.title)
    } catch (e) {
      console.error("getExistingResourceTitles DB exception:", e)
    }
  }
  return []
}

export async function getCuratedResourceCounts(): Promise<{ pending: number; approved: number; rejected: number; total: number }> {
  const zero = { pending: 0, approved: 0, rejected: 0, total: 0 }
  if (USE_DB) {
    try {
      const rows = await db!.select({
        status: curatedResources.status,
        count: sql<number>`count(*)::int`,
      }).from(curatedResources).groupBy(curatedResources.status)

      const counts = { ...zero }
      for (const row of rows) {
        if (row.status === "deleted") continue
        if (row.status === "pending") counts.pending = row.count
        else if (row.status === "approved") counts.approved = row.count
        else if (row.status === "rejected") counts.rejected = row.count
        counts.total += row.count
      }
      return counts
    } catch (e) {
      console.error("getCuratedResourceCounts DB exception:", e)
    }
  }
  return zero
}

export async function getLastGenerationTime(): Promise<Date | null> {
  if (USE_DB) {
    try {
      const rows = await db!.select({ created_at: curatedResources.created_at })
        .from(curatedResources)
        .orderBy(desc(curatedResources.created_at))
        .limit(1)
      return rows[0]?.created_at ?? null
    } catch (e) {
      console.error("getLastGenerationTime DB exception:", e)
    }
  }
  return null
}

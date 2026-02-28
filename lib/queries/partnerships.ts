import { db, USE_DB } from "@/lib/db"
import { trustedPartners } from "@/lib/db/schema"
import { eq, and, asc } from "drizzle-orm"

export type TrustedPartner = typeof trustedPartners.$inferSelect
export type NewTrustedPartner = typeof trustedPartners.$inferInsert

export async function getHomepagePartners(): Promise<TrustedPartner[]> {
  if (USE_DB) {
    try {
      return await db!.select().from(trustedPartners)
        .where(and(eq(trustedPartners.is_active, true), eq(trustedPartners.show_on_homepage, true)))
        .orderBy(asc(trustedPartners.display_order))
    } catch (e) {
      console.error("getHomepagePartners DB exception:", e)
    }
  }
  return []
}

export async function getActivePartners(): Promise<TrustedPartner[]> {
  if (USE_DB) {
    try {
      return await db!.select().from(trustedPartners)
        .where(eq(trustedPartners.is_active, true))
        .orderBy(asc(trustedPartners.display_order))
    } catch (e) {
      console.error("getActivePartners DB exception:", e)
    }
  }
  return []
}

export async function getAllPartners(): Promise<TrustedPartner[]> {
  if (USE_DB) {
    try {
      return await db!.select().from(trustedPartners)
        .orderBy(asc(trustedPartners.display_order))
    } catch (e) {
      console.error("getAllPartners DB exception:", e)
    }
  }
  return []
}

export async function createPartner(data: Omit<NewTrustedPartner, "id" | "created_at" | "updated_at">): Promise<TrustedPartner | null> {
  if (USE_DB) {
    try {
      const rows = await db!.insert(trustedPartners).values(data).returning()
      return rows[0] ?? null
    } catch (e) {
      console.error("createPartner DB exception:", e)
    }
  }
  return null
}

export async function updatePartner(id: string, data: Partial<Omit<NewTrustedPartner, "id" | "created_at" | "updated_at">>): Promise<TrustedPartner | null> {
  if (USE_DB) {
    try {
      const rows = await db!.update(trustedPartners)
        .set({ ...data, updated_at: new Date() })
        .where(eq(trustedPartners.id, id))
        .returning()
      return rows[0] ?? null
    } catch (e) {
      console.error("updatePartner DB exception:", e)
    }
  }
  return null
}

export async function deletePartner(id: string): Promise<boolean> {
  if (USE_DB) {
    try {
      const result = await db!.delete(trustedPartners).where(eq(trustedPartners.id, id))
      return (result.rowCount ?? 0) > 0
    } catch (e) {
      console.error("deletePartner DB exception:", e)
    }
  }
  return false
}

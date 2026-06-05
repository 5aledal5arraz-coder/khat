"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/api-utils"
import {
  createPartner,
  updatePartner,
  deletePartner,
} from "@/lib/queries/partnerships"
import type { NewTrustedPartner } from "@/lib/queries/partnerships"
import { db } from "@/lib/db"
import { trustedPartners } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { invalidate } from "@/lib/cache"

function revalidateAll() {
  invalidate("homepage")
  revalidatePath("/")
  revalidatePath("/sponsor")
  revalidatePath("/admin/partnerships")
}

export async function createPartnerAction(
  data: Omit<NewTrustedPartner, "id" | "created_at" | "updated_at">
) {
  await requireAdmin()
  const partner = await createPartner(data)
  revalidateAll()
  return partner
}

export async function updatePartnerAction(
  id: string,
  data: Partial<Omit<NewTrustedPartner, "id" | "created_at" | "updated_at">>
) {
  await requireAdmin()
  const partner = await updatePartner(id, data)
  revalidateAll()
  return partner
}

export async function deletePartnerAction(id: string) {
  await requireAdmin()
  const success = await deletePartner(id)
  revalidateAll()
  return success
}

export async function reorderPartnersAction(
  orderedIds: { id: string; display_order: number }[]
) {
  await requireAdmin()
  if (!db) return false
  try {
    for (const item of orderedIds) {
      await db.update(trustedPartners)
        .set({ display_order: item.display_order })
        .where(eq(trustedPartners.id, item.id))
    }
    revalidateAll()
    return true
  } catch (e) {
    console.error("reorderPartnersAction error:", e)
    return false
  }
}

"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/api-utils"
import { updateCuratedResource } from "@/lib/queries/curated-resources"

function revalidateAll() {
  revalidatePath("/resources")
  revalidatePath("/admin/resources")
}

export async function approveResourceAction(id: string) {
  await requireAdmin()
  const updated = await updateCuratedResource(id, {
    status: "approved",
    approved_at: new Date(),
  })
  revalidateAll()
  return updated
}

export async function rejectResourceAction(id: string) {
  await requireAdmin()
  const updated = await updateCuratedResource(id, {
    status: "rejected",
  })
  revalidateAll()
  return updated
}

export async function editResourceAction(
  id: string,
  data: { title?: string; url?: string; author?: string; description?: string }
) {
  await requireAdmin()
  const updated = await updateCuratedResource(id, data)
  revalidateAll()
  return updated
}

export async function resetResourceAction(id: string) {
  await requireAdmin()
  const updated = await updateCuratedResource(id, {
    status: "pending",
    approved_at: null,
  })
  revalidateAll()
  return updated
}

"use server"

import { revalidatePath } from "next/cache"
import { requireActionRole } from "@/lib/api-utils"
import {
  createPlatform,
  updatePlatform,
  deletePlatform,
  reorderPlatforms,
  type NewOfficialPlatformLink,
} from "@/lib/queries/official-platforms"

/**
 * Revalidate every public surface that renders official platform links.
 * When in doubt, include a new route here.
 */
function revalidateAll() {
  revalidatePath("/", "layout") // re-render footer (used on every page)
  revalidatePath("/listen")
  revalidatePath("/contact")
  revalidatePath("/about")
  revalidatePath("/")
  revalidatePath("/episodes", "layout")
  revalidatePath("/admin/settings")
}

export async function createPlatformLinkAction(
  data: Omit<NewOfficialPlatformLink, "id" | "created_at" | "updated_at">,
) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) throw new Error(gate.error)
  const link = await createPlatform(data)
  revalidateAll()
  return link
}

export async function updatePlatformLinkAction(
  id: string,
  data: Partial<Omit<NewOfficialPlatformLink, "id" | "created_at" | "updated_at">>,
) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) throw new Error(gate.error)
  const link = await updatePlatform(id, data)
  revalidateAll()
  return link
}

export async function deletePlatformLinkAction(id: string) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) throw new Error(gate.error)
  const success = await deletePlatform(id)
  revalidateAll()
  return success
}

export async function reorderPlatformLinksAction(
  orderedIds: { id: string; sort_order: number }[],
) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) throw new Error(gate.error)
  await reorderPlatforms(orderedIds)
  revalidateAll()
  return true
}

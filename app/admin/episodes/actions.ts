"use server"

import { revalidatePath } from "next/cache"
import {
  getEpisodeOverrides,
  setEpisodeOverride,
  deleteEpisodeOverride,
} from "@/lib/episode-overrides"
import { getSectionsConfig, saveSectionsConfig } from "@/lib/episode-sections"
import { assignGuestToEpisode as assignGuest } from "@/lib/episode-guests"
import { requireAdmin } from "@/lib/api-utils"
import { ADMIN_LIMITS } from "@/lib/validation"
import { invalidateEpisodeCache, getCacheStatus } from "@/lib/cache/episode-cache"
import { saveVersion } from "@/lib/episode-versions"
import type { EpisodeOverride, EpisodeSection } from "@/types/episodes"

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
  revalidatePath("/")
  revalidatePath("/episodes")
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
  revalidatePath("/")
  revalidatePath("/episodes")
  revalidatePath("/admin/episodes")
  revalidatePath(`/admin/episodes/${episodeId}`)

  return { success: true }
}

export async function removeEpisodeOverride(episodeId: string) {
  await requireAdmin()
  await deleteEpisodeOverride(episodeId)

  await invalidateEpisodeCache()
  revalidatePath("/")
  revalidatePath("/episodes")
  revalidatePath("/admin/episodes")
  revalidatePath(`/admin/episodes/${episodeId}`)

  return { success: true }
}

export async function getOverrides() {
  await requireAdmin()
  return getEpisodeOverrides()
}

export async function createSection(label: string, color?: string) {
  await requireAdmin()
  if (!label || typeof label !== "string" || !label.trim()) {
    return { success: false, error: "اسم التصنيف مطلوب" }
  }

  const trimmedLabel = label.trim().slice(0, ADMIN_LIMITS.LABEL_LENGTH)
  // Validate color format if provided
  const validColor = color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : undefined

  const config = await getSectionsConfig()
  const id = `section-${crypto.randomUUID()}`
  const order = config.sections.length
  const newSection: EpisodeSection = { id, label: trimmedLabel, order, color: validColor }
  config.sections.push(newSection)
  await saveSectionsConfig(config)

  revalidatePath("/admin/episodes")
  return { success: true, section: newSection }
}

export async function deleteSection(sectionId: string) {
  await requireAdmin()
  const config = await getSectionsConfig()
  config.sections = config.sections.filter((s) => s.id !== sectionId)
  // Unassign episodes from deleted section
  for (const [epId, secId] of Object.entries(config.assignments)) {
    if (secId === sectionId) {
      delete config.assignments[epId]
    }
  }
  await saveSectionsConfig(config)

  revalidatePath("/admin/episodes")
  return { success: true }
}

export async function assignEpisodeSection(
  episodeId: string,
  sectionId: string | null
) {
  await requireAdmin()
  const config = await getSectionsConfig()
  await saveVersion(episodeId, "section_assignment", {
    previousSection: config.assignments[episodeId] || null,
  }, `تغيير التصنيف`)
  if (sectionId) {
    config.assignments[episodeId] = sectionId
  } else {
    delete config.assignments[episodeId]
  }
  await saveSectionsConfig(config)

  revalidatePath("/admin/episodes")
  revalidatePath(`/admin/episodes/${episodeId}`)
  return { success: true }
}

export async function toggleEpisodeVisibility(episodeId: string) {
  await requireAdmin()
  const config = await getSectionsConfig()
  const wasHidden = config.hiddenEpisodes.includes(episodeId)
  await saveVersion(episodeId, "visibility", { hidden: wasHidden }, wasHidden ? "إظهار الحلقة" : "إخفاء الحلقة")
  const idx = config.hiddenEpisodes.indexOf(episodeId)
  if (idx >= 0) {
    config.hiddenEpisodes.splice(idx, 1)
  } else {
    config.hiddenEpisodes.push(episodeId)
  }
  await saveSectionsConfig(config)

  await invalidateEpisodeCache()
  revalidatePath("/")
  revalidatePath("/episodes")
  revalidatePath("/admin/episodes")
  revalidatePath(`/admin/episodes/${episodeId}`)
  return { success: true }
}

export async function toggleSectionVisibility(sectionId: string) {
  await requireAdmin()
  const config = await getSectionsConfig()
  const section = config.sections.find((s) => s.id === sectionId)
  if (section) {
    section.hidden = !section.hidden
  }
  await saveSectionsConfig(config)

  await invalidateEpisodeCache()
  revalidatePath("/")
  revalidatePath("/episodes")
  revalidatePath("/admin/episodes")
  return { success: true }
}

export async function deleteEpisode(episodeId: string) {
  await requireAdmin()
  const config = await getSectionsConfig()
  if (!config.deletedEpisodes.includes(episodeId)) {
    config.deletedEpisodes.push(episodeId)
  }
  // Remove from section assignment
  delete config.assignments[episodeId]
  // Remove from hidden (no point hiding a deleted episode)
  config.hiddenEpisodes = config.hiddenEpisodes.filter((id) => id !== episodeId)
  await saveSectionsConfig(config)

  await invalidateEpisodeCache()
  revalidatePath("/")
  revalidatePath("/episodes")
  revalidatePath("/admin/episodes")
  revalidatePath(`/admin/episodes/${episodeId}`)
  return { success: true }
}

export async function restoreEpisode(episodeId: string) {
  await requireAdmin()
  const config = await getSectionsConfig()
  config.deletedEpisodes = config.deletedEpisodes.filter((id) => id !== episodeId)
  // Episode returns as uncategorized — no section assignment needed
  await saveSectionsConfig(config)

  await invalidateEpisodeCache()
  revalidatePath("/")
  revalidatePath("/episodes")
  revalidatePath("/admin/episodes")
  revalidatePath(`/admin/episodes/${episodeId}`)
  return { success: true }
}

export async function bulkAssignSection(
  episodeIds: string[],
  sectionId: string | null
) {
  await requireAdmin()
  const config = await getSectionsConfig()
  for (const epId of episodeIds) {
    if (sectionId) {
      config.assignments[epId] = sectionId
    } else {
      delete config.assignments[epId]
    }
  }
  await saveSectionsConfig(config)

  await invalidateEpisodeCache()
  revalidatePath("/")
  revalidatePath("/episodes")
  revalidatePath("/admin/episodes")
  return { success: true }
}

export async function bulkDeleteEpisodes(episodeIds: string[]) {
  await requireAdmin()
  const config = await getSectionsConfig()
  for (const epId of episodeIds) {
    if (!config.deletedEpisodes.includes(epId)) {
      config.deletedEpisodes.push(epId)
    }
    delete config.assignments[epId]
    config.hiddenEpisodes = config.hiddenEpisodes.filter((id) => id !== epId)
  }
  await saveSectionsConfig(config)

  await invalidateEpisodeCache()
  revalidatePath("/")
  revalidatePath("/episodes")
  revalidatePath("/admin/episodes")
  return { success: true }
}

export async function assignEpisodeGuest(
  episodeId: string,
  guestId: string | null
) {
  await requireAdmin()
  if (!episodeId) {
    return { success: false, error: "بيانات غير صالحة" }
  }

  await saveVersion(episodeId, "guest_assignment", { previousGuestId: guestId }, `تعيين ضيف`)
  await assignGuest(episodeId, guestId)

  await invalidateEpisodeCache()
  revalidatePath("/")
  revalidatePath("/episodes")
  revalidatePath("/admin/episodes")
  revalidatePath(`/admin/episodes/${episodeId}`)
  return { success: true }
}

export async function invalidateEpisodeCacheAction() {
  await requireAdmin()
  await invalidateEpisodeCache()
  revalidatePath("/")
  revalidatePath("/episodes")
  revalidatePath("/admin/episodes")
  return { success: true }
}

export async function getEpisodeCacheStatusAction() {
  await requireAdmin()
  return getCacheStatus()
}

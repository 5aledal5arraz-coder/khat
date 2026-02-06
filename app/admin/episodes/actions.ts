"use server"

import { revalidatePath } from "next/cache"
import {
  getEpisodeOverrides,
  setEpisodeOverride,
  deleteEpisodeOverride,
} from "@/lib/episode-overrides"
import { getSectionsConfig, saveSectionsConfig } from "@/lib/episode-sections"
import type { EpisodeOverride, EpisodeSection } from "@/types/ads"

export async function updateEpisodeTitle(
  episodeId: string,
  originalTitle: string,
  customTitle: string
) {
  if (customTitle.trim() === "" || customTitle === originalTitle) {
    await deleteEpisodeOverride(episodeId)
  } else {
    await setEpisodeOverride({
      id: episodeId,
      originalTitle,
      customTitle: customTitle.trim(),
    })
  }

  revalidatePath("/")
  revalidatePath("/episodes")
  revalidatePath("/admin/episodes")

  return { success: true }
}

export async function removeEpisodeOverride(episodeId: string) {
  await deleteEpisodeOverride(episodeId)

  revalidatePath("/")
  revalidatePath("/episodes")
  revalidatePath("/admin/episodes")

  return { success: true }
}

export async function getOverrides() {
  return getEpisodeOverrides()
}

export async function createSection(label: string, color?: string) {
  const config = await getSectionsConfig()
  const id = `section-${Date.now()}`
  const order = config.sections.length
  const newSection: EpisodeSection = { id, label, order, color }
  config.sections.push(newSection)
  await saveSectionsConfig(config)

  revalidatePath("/admin/episodes")
  return { success: true, section: newSection }
}

export async function deleteSection(sectionId: string) {
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
  const config = await getSectionsConfig()
  if (sectionId) {
    config.assignments[episodeId] = sectionId
  } else {
    delete config.assignments[episodeId]
  }
  await saveSectionsConfig(config)

  revalidatePath("/admin/episodes")
  return { success: true }
}

export async function toggleEpisodeVisibility(episodeId: string) {
  const config = await getSectionsConfig()
  const idx = config.hiddenEpisodes.indexOf(episodeId)
  if (idx >= 0) {
    config.hiddenEpisodes.splice(idx, 1)
  } else {
    config.hiddenEpisodes.push(episodeId)
  }
  await saveSectionsConfig(config)

  revalidatePath("/")
  revalidatePath("/episodes")
  revalidatePath("/admin/episodes")
  return { success: true }
}

export async function toggleSectionVisibility(sectionId: string) {
  const config = await getSectionsConfig()
  const section = config.sections.find((s) => s.id === sectionId)
  if (section) {
    section.hidden = !section.hidden
  }
  await saveSectionsConfig(config)

  revalidatePath("/")
  revalidatePath("/episodes")
  revalidatePath("/admin/episodes")
  return { success: true }
}

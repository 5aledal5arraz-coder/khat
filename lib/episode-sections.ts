import { readFile, writeFile, mkdir } from "fs/promises"
import path from "path"
import type { EpisodeSectionsConfig } from "@/types/ads"

const SECTIONS_PATH = path.join(process.cwd(), "config", "episode-sections.json")

const defaultConfig: EpisodeSectionsConfig = {
  sections: [
    { id: "season-1", label: "الموسم الأول", order: 0, color: "#3b82f6" },
    { id: "season-2", label: "الموسم الثاني", order: 1, color: "#8b5cf6" },
    { id: "clips", label: "مقاطع", order: 2, color: "#f59e0b" },
    { id: "unpublished", label: "محتوى غير منشور", order: 3, color: "#6b7280" },
  ],
  assignments: {},
  hiddenEpisodes: [],
  deletedEpisodes: [],
}

export async function getSectionsConfig(): Promise<EpisodeSectionsConfig> {
  try {
    const data = await readFile(SECTIONS_PATH, "utf-8")
    const config = JSON.parse(data) as EpisodeSectionsConfig
    // Ensure fields exist for older configs
    if (!config.hiddenEpisodes) config.hiddenEpisodes = []
    if (!config.deletedEpisodes) config.deletedEpisodes = []
    return config
  } catch {
    return defaultConfig
  }
}

export async function getHiddenEpisodeIds(): Promise<Set<string>> {
  const config = await getSectionsConfig()
  const hidden = new Set([...config.hiddenEpisodes, ...config.deletedEpisodes])
  // Also collect episodes assigned to hidden sections
  const hiddenSectionIds = new Set(
    config.sections.filter((s) => s.hidden).map((s) => s.id)
  )
  for (const [epId, secId] of Object.entries(config.assignments)) {
    if (hiddenSectionIds.has(secId)) {
      hidden.add(epId)
    }
  }
  return hidden
}

export async function saveSectionsConfig(config: EpisodeSectionsConfig): Promise<void> {
  const configDir = path.dirname(SECTIONS_PATH)
  await mkdir(configDir, { recursive: true })
  await writeFile(SECTIONS_PATH, JSON.stringify(config, null, 2), "utf-8")
}

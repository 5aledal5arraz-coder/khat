import { readFile, writeFile, mkdir } from "fs/promises"
import path from "path"
import type { EpisodeEnrichment } from "@/types/ads"

const ENRICHMENTS_PATH = path.join(process.cwd(), "config", "episode-enrichments.json")

type EnrichmentsConfig = Record<string, EpisodeEnrichment>

async function readConfig(): Promise<EnrichmentsConfig> {
  try {
    const data = await readFile(ENRICHMENTS_PATH, "utf-8")
    return JSON.parse(data) as EnrichmentsConfig
  } catch {
    return {}
  }
}

async function writeConfig(config: EnrichmentsConfig): Promise<void> {
  const configDir = path.dirname(ENRICHMENTS_PATH)
  await mkdir(configDir, { recursive: true })
  await writeFile(ENRICHMENTS_PATH, JSON.stringify(config, null, 2), "utf-8")
}

export async function getEpisodeEnrichment(episodeId: string): Promise<EpisodeEnrichment | null> {
  const config = await readConfig()
  return config[episodeId] || null
}

export async function setEpisodeEnrichment(enrichment: EpisodeEnrichment): Promise<void> {
  const config = await readConfig()
  const existing = config[enrichment.episodeId]
  // Merge: only overwrite fields that are present in the new enrichment
  config[enrichment.episodeId] = { ...existing, ...enrichment }
  await writeConfig(config)
}

export async function deleteEpisodeEnrichment(episodeId: string): Promise<void> {
  const config = await readConfig()
  delete config[episodeId]
  await writeConfig(config)
}

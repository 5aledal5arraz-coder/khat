import { createConfigStore } from "@/lib/config-store"
import type { EpisodeVersion, EpisodeVersionChangeType } from "@/types/database"

interface VersionsStore {
  versions: EpisodeVersion[]
}

const store = createConfigStore<VersionsStore>("episode-versions.json", {
  versions: [],
})

export async function saveVersion(
  episodeId: string,
  changeType: EpisodeVersionChangeType,
  snapshot: Record<string, unknown>,
  summary?: string
): Promise<EpisodeVersion> {
  const data = await store.read()

  // Auto-increment version number for this episode
  const episodeVersions = data.versions.filter((v) => v.episode_id === episodeId)
  const nextVersion = episodeVersions.length > 0
    ? Math.max(...episodeVersions.map((v) => v.version_number)) + 1
    : 1

  const version: EpisodeVersion = {
    id: `ver-${crypto.randomUUID()}`,
    episode_id: episodeId,
    version_number: nextVersion,
    change_type: changeType,
    change_summary: summary || null,
    snapshot,
    created_by: "admin",
    created_at: new Date().toISOString(),
  }

  data.versions.push(version)
  await store.write(data)

  return version
}

export async function getVersionHistory(
  episodeId: string,
  limit: number = 20
): Promise<EpisodeVersion[]> {
  const data = await store.read()
  return data.versions
    .filter((v) => v.episode_id === episodeId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit)
}

export async function getVersion(versionId: string): Promise<EpisodeVersion | null> {
  const data = await store.read()
  return data.versions.find((v) => v.id === versionId) || null
}

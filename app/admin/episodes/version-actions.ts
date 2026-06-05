"use server"

import { revalidatePath } from "next/cache"
import { getVersionHistory, getVersion, saveVersion } from "@/lib/episodes/versions"
import { setEpisodeOverride } from "@/lib/episodes/overrides"
import { getQuotesConfig, saveQuotesConfig } from "@/lib/episodes/quotes"
import { setEpisodeEnrichment } from "@/lib/episodes/enrichments"
import { requireAdmin } from "@/lib/api-utils"
import type { EpisodeVersion } from "@/types/database"

export async function getVersionHistoryAction(episodeId: string): Promise<EpisodeVersion[]> {
  await requireAdmin()
  return getVersionHistory(episodeId)
}

export async function restoreEpisodeVersionAction(versionId: string) {
  await requireAdmin()

  const version = await getVersion(versionId)
  if (!version) return { success: false, error: "النسخة غير موجودة" }

  const snapshot = version.snapshot

  try {
    switch (version.change_type) {
      case "title_override":
      case "description_override": {
        if (snapshot.override) {
          await setEpisodeOverride(snapshot.override as Parameters<typeof setEpisodeOverride>[0])
        }
        break
      }
      case "quotes": {
        if (snapshot.quotesEntry) {
          const config = await getQuotesConfig()
          config[version.episode_id] = snapshot.quotesEntry as (typeof config)[string]
          await saveQuotesConfig(config)
        }
        break
      }
      case "enrichment":
      case "conversation": {
        if (snapshot.enrichment) {
          await setEpisodeEnrichment(snapshot.enrichment as Parameters<typeof setEpisodeEnrichment>[0])
        }
        break
      }
      default:
        return { success: false, error: `نوع التغيير "${version.change_type}" غير مدعوم للاستعادة` }
    }

    // Record the restore itself as a new version
    await saveVersion(
      version.episode_id,
      version.change_type,
      snapshot,
      `استعادة من النسخة v${version.version_number}`
    )

    revalidatePath("/")
    revalidatePath("/episodes")
    revalidatePath("/admin/episodes")
    revalidatePath(`/admin/episodes/${version.episode_id}`)

    return { success: true }
  } catch (error) {
    console.error("Restore failed:", error)
    return { success: false, error: "فشل في الاستعادة" }
  }
}

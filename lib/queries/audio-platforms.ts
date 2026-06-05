/**
 * Legacy compatibility shim.
 *
 * The canonical module is `lib/queries/official-platforms.ts`. This file
 * re-exports the same API under the old names so existing callers keep
 * working while the codebase migrates. It ALSO still owns the RSS sync
 * status helpers (stored in `config_store`), which are a separate feature.
 */

import { db } from "@/lib/db"
import { configStore } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export {
  listAllPlatforms as getAllPlatformLinks,
  listActivePlatforms as getActivePlatformLinks,
  createPlatform as createPlatformLink,
  updatePlatform as updatePlatformLink,
  deletePlatform as deletePlatformLink,
  reorderPlatforms as reorderPlatformLinks,
  getPlatformById,
  getPlatformByKey,
  listPlatformsForSurface,
} from "./official-platforms"

export type {
  OfficialPlatformLink as PodcastPlatformLink,
  NewOfficialPlatformLink as NewPodcastPlatformLink,
} from "./official-platforms"

// ---------------------------------------------------------------------------
// RSS Sync Status (stored in configStore) — separate feature, kept here
// ---------------------------------------------------------------------------

export interface RssSyncStatus {
  syncedAt: string
  totalItems: number
  matched: number
  skipped: number
  errors: string[]
  status: "success" | "error"
  message?: string
}

export async function getRssSyncStatus(): Promise<RssSyncStatus | null> {
  if (!db) return null
  const rows = await db
    .select()
    .from(configStore)
    .where(eq(configStore.key, "rss_sync"))
    .limit(1)
  if (rows.length === 0) return null
  return rows[0].value as RssSyncStatus
}

export async function updateRssSyncStatus(value: RssSyncStatus): Promise<void> {
  if (!db) return
  await db
    .insert(configStore)
    .values({ key: "rss_sync", value: value as unknown as Record<string, unknown> })
    .onConflictDoUpdate({
      target: configStore.key,
      set: { value: value as unknown as Record<string, unknown>, updated_at: new Date() },
    })
}

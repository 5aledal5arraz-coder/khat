import { createConfigStore } from "@/lib/config-store"
import { db, USE_DB } from "@/lib/db"
import { platformAnalytics } from "@/lib/db/schema"
import { sql } from "drizzle-orm"
import type { AnalyticsConfig } from "@/types/media-kit"

const defaultConfig: AnalyticsConfig = {
  youtube: { followers: 0, posts: 0, engagement: "0%", url: "" },
  x: { followers: 0, posts: 0, engagement: "0%", url: "" },
  tiktok: { followers: 0, posts: 0, engagement: "0%", url: "" },
  instagram: { followers: 0, posts: 0, engagement: "0%", url: "" },
}

const PLATFORMS = ["youtube", "x", "tiktok", "instagram"] as const

const store = createConfigStore<AnalyticsConfig>("analytics.json", defaultConfig)

export async function getAnalyticsConfig(): Promise<AnalyticsConfig> {
  if (USE_DB) {
    try {
      const rows = await db!.select().from(platformAnalytics)
        .where(sql`${platformAnalytics.platform} = ANY(${PLATFORMS})`)

      if (rows.length > 0) {
        const config = { ...defaultConfig }
        for (const row of rows) {
          const key = row.platform as keyof AnalyticsConfig
          if (key in config) {
            config[key] = {
              followers: row.followers ?? 0,
              posts: row.posts ?? 0,
              engagement: row.engagement ?? "0%",
              url: row.url ?? "",
            }
          }
        }
        return config
      }
    } catch (e) {
      console.error("getAnalyticsConfig DB exception:", e)
    }
  }
  return store.read()
}

export async function saveAnalyticsConfig(config: AnalyticsConfig): Promise<void> {
  if (USE_DB) {
    try {
      for (const platform of PLATFORMS) {
        const stats = config[platform]
        await db!.insert(platformAnalytics).values({
          platform,
          followers: stats.followers,
          posts: stats.posts,
          engagement: stats.engagement,
          url: stats.url,
        }).onConflictDoUpdate({
          target: platformAnalytics.platform,
          set: {
            followers: stats.followers,
            posts: stats.posts,
            engagement: stats.engagement,
            url: stats.url,
          },
        })
      }
      return
    } catch (e) {
      console.error("saveAnalyticsConfig DB exception:", e)
    }
  }
  await store.write(config)
}

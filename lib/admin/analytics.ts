import { createConfigStore } from "@/lib/config-store"
import { pool, USE_DB } from "@/lib/db"
import type { AnalyticsConfig, PlatformStats } from "@/types/media-kit"

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
      const { rows } = await pool!.query(
        `SELECT platform, followers, posts, engagement, url
         FROM platform_analytics
         WHERE platform = ANY($1)`,
        [PLATFORMS]
      )

      if (rows.length > 0) {
        const config = { ...defaultConfig }
        for (const row of rows) {
          const key = row.platform as keyof AnalyticsConfig
          if (key in config) {
            config[key] = {
              followers: row.followers,
              posts: row.posts,
              engagement: row.engagement,
              url: row.url,
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
        await pool!.query(
          `INSERT INTO platform_analytics (platform, followers, posts, engagement, url)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (platform) DO UPDATE SET
             followers = EXCLUDED.followers,
             posts = EXCLUDED.posts,
             engagement = EXCLUDED.engagement,
             url = EXCLUDED.url`,
          [platform, stats.followers, stats.posts, stats.engagement, stats.url]
        )
      }
      return
    } catch (e) {
      console.error("saveAnalyticsConfig DB exception:", e)
    }
  }
  await store.write(config)
}

import { createConfigStore } from "@/lib/config-store"
import { pool, USE_DB } from "@/lib/db"

const MAX_ENTRIES = 100

export interface PushLogEntry {
  sessionId: string
  episodeId: string
  episodeTitle: string
  pushedFields: string[]
  pushedAt: string
}

const store = createConfigStore<PushLogEntry[]>("studio-push-log.json", [])

export async function appendPushLog(entry: PushLogEntry): Promise<void> {
  if (USE_DB) {
    try {
      await pool!.query(
        `INSERT INTO studio_push_log (session_id, episode_id, episode_title, pushed_fields, pushed_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [entry.sessionId, entry.episodeId, entry.episodeTitle, entry.pushedFields, entry.pushedAt]
      )
      return
    } catch (e) {
      console.error("appendPushLog DB exception:", e)
    }
  }

  const log = await store.read()
  log.unshift(entry)
  // Keep only the most recent entries
  await store.write(log.slice(0, MAX_ENTRIES))
}

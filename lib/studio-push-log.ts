import { createConfigStore } from "@/lib/config-store"
import { db, USE_DB } from "@/lib/db"
import { studioPushLog } from "@/lib/db/schema"

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
      await db!.insert(studioPushLog).values({
        session_id: entry.sessionId,
        episode_id: entry.episodeId,
        episode_title: entry.episodeTitle,
        pushed_fields: entry.pushedFields,
        pushed_at: new Date(entry.pushedAt),
      })
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

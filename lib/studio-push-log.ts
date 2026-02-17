import { createConfigStore } from "@/lib/config-store"
import { createClient } from "@/lib/supabase/server"

const USE_SUPABASE = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
)

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
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { error } = await supabase.from("studio_push_log").insert({
        session_id: entry.sessionId,
        episode_id: entry.episodeId,
        episode_title: entry.episodeTitle,
        pushed_fields: entry.pushedFields,
        pushed_at: entry.pushedAt,
      })
      if (!error) return
      console.error("appendPushLog DB error:", error.message)
    } catch (e) {
      console.error("appendPushLog DB exception:", e)
    }
  }

  const log = await store.read()
  log.unshift(entry)
  // Keep only the most recent entries
  await store.write(log.slice(0, MAX_ENTRIES))
}

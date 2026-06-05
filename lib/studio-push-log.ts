/**
 * Studio push-log — persistence routed through studio_analysis_records
 * (Khat Brain Phase 5). Append-only history of studio→episode pushes.
 *
 * `replace: false` makes every append a fresh row instead of replacing
 * the prior one — push_log is the only kind that wants history.
 */

import {
  upsertStudioAnalysisRecord,
  resolveEirIdForSession,
} from "@/lib/studio/analysis-records"

export interface PushLogEntry {
  sessionId: string
  episodeId: string
  episodeTitle: string
  pushedFields: string[]
  pushedAt: string
}

export async function appendPushLog(entry: PushLogEntry): Promise<void> {
  const eirId = await resolveEirIdForSession(entry.sessionId)
  await upsertStudioAnalysisRecord({
    studio_session_id: entry.sessionId,
    eir_id: eirId,
    kind: "push_log",
    status: "ready",
    data: {
      episode_id: entry.episodeId,
      episode_title: entry.episodeTitle,
      pushed_fields: entry.pushedFields,
      pushed_at: entry.pushedAt,
    },
    published_at: new Date(entry.pushedAt),
    replace: false, // append-only history
  })
}

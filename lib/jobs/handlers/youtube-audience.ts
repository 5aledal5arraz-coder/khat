/**
 * YouTube audience snapshots — a weekly refresh of TWO windows: the last 28
 * days and the lifetime window («منذ أول حلقة»).
 *
 * The age/country snapshots on /admin/youtube-analytics (and quoted on
 * /partner) only ever refreshed when the owner pressed a button, so the
 * stored figures quietly aged. This tick re-measures them weekly through the
 * SAME path as the button (`measureAudience`), over a fixed, stated window:
 * the last 28 days ending yesterday, and the lifetime window that /partner
 * prefers (see latestPreferredSnapshot).
 *
 * Cost: four YouTube Analytics API reports per week (2 windows × 2 reports) — free, quota-light.
 *
 * Failure: a token or API error is recorded on the grant (`last_error`) by
 * `report()` in lib/youtube/analytics.ts, so the admin page shows it, and the
 * job itself fails loudly. Not connected / not configured is a quiet skip —
 * an absent grant is a state, not an error.
 *
 * Follows the market.source_feedback pattern: queue the next tick FIRST (so a
 * failing run can't end the schedule), then do the work. Seeded at worker
 * startup by `ensureYoutubeAudienceSchedule()`.
 */
import { registerHandler } from "../registry"
import { enqueueRecurringTick } from "../queue"
import { measureAudience, windowOfDays, windowSinceFirstEpisode } from "@/lib/youtube/analytics"
import { loadGrantStatus, oauthConfigProblem } from "@/lib/youtube/oauth"

export const YOUTUBE_AUDIENCE_JOB = "youtube.audience_refresh"

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
/** The window the scheduled measure uses — matches the «آخر ٢٨ يومًا» button. */
const WINDOW_DAYS = 28

export function audienceRefreshIntervalMs(): number {
  const v = Number(process.env.KHAT_YOUTUBE_AUDIENCE_INTERVAL_MS)
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : WEEK_MS
}

export type AudienceRefreshResult =
  | { status: "skipped"; reason: string }
  | {
      status: "measured"
      windows: { label: "last28" | "lifetime"; startDate: string; endDate: string }[]
    }

export async function runYoutubeAudienceRefresh(now: Date = new Date()): Promise<AudienceRefreshResult> {
  await enqueueRecurringTick(
    YOUTUBE_AUDIENCE_JOB,
    {},
    { priority: 1, maxAttempts: 1, runAfter: new Date(now.getTime() + audienceRefreshIntervalMs()) },
  )

  const problem = oauthConfigProblem()
  if (problem) return { status: "skipped", reason: problem }
  const grant = await loadGrantStatus()
  if (!grant) return { status: "skipped", reason: "YouTube Analytics غير مربوط" }

  // BOTH windows, so a reader that prefers the lifetime window (/partner —
  // see latestPreferredSnapshot) is refreshed too and is never silently
  // replaced by the 28-day figures.
  const windows: { label: "last28" | "lifetime"; startDate: string; endDate: string }[] = [
    { label: "last28", ...windowOfDays(WINDOW_DAYS, now) },
  ]
  const lifetime = await windowSinceFirstEpisode()
  if (lifetime) windows.push({ label: "lifetime", ...lifetime })
  for (const w of windows) await measureAudience(w)
  return { status: "measured", windows }
}

registerHandler<Record<string, never>, AudienceRefreshResult>(YOUTUBE_AUDIENCE_JOB, async () =>
  runYoutubeAudienceRefresh(),
)

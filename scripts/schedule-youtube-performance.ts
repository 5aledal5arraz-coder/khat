/**
 * Khat Brain Phase 4 — schedule YouTube performance refresh jobs.
 *
 * For every EIR in phase {published, analyzing, learned} that has a
 * linked episode with a YouTube URL we can parse, enqueue one
 * `youtube.refresh_performance` job. Idempotent — duplicate jobs are
 * fine; the worker just writes another snapshot.
 *
 * Designed to be run on a cron schedule (e.g. every 6h via the host's
 * crontab). The job runtime itself is Postgres-backed; the worker
 * (`npm run worker`) picks them up.
 *
 *   npm run jobs:schedule-youtube-performance
 */

import { eq, inArray, isNotNull, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { episodeIntelligenceRecords } from "@/lib/db/schema/eir"
import { episodes } from "@/lib/db/schema/episodes"
import { enqueueJob } from "@/lib/jobs"
import type { EpisodePhase } from "@/lib/eir"

/** Best-effort YouTube id extractor — accepts youtu.be, youtube.com/watch?v=, youtube.com/embed/, /v/. */
function extractVideoId(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    if (u.hostname === "youtu.be") {
      const id = u.pathname.replace(/^\//, "").split("/")[0]
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
    }
    if (u.hostname.endsWith("youtube.com")) {
      const v = u.searchParams.get("v")
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v
      const m = u.pathname.match(/\/(?:embed|v|shorts)\/([A-Za-z0-9_-]{11})/)
      if (m) return m[1]
    }
    return null
  } catch {
    return null
  }
}

const ELIGIBLE: EpisodePhase[] = ["published", "analyzing", "learned"]

async function main() {
  console.log("Khat Brain — YouTube performance scheduler\n")

  // Find every (eir_id, episode_id, video_id) triple that's eligible.
  // We join EIR → episodes via episodes.eir_id (Phase 3 propagation).
  const rows = await db!
    .select({
      eir_id: episodeIntelligenceRecords.id,
      phase: episodeIntelligenceRecords.phase,
      episode_id: episodes.id,
      youtube_url: episodes.youtube_url,
    })
    .from(episodeIntelligenceRecords)
    .innerJoin(episodes, eq(episodes.eir_id, episodeIntelligenceRecords.id))
    .where(
      and(
        inArray(episodeIntelligenceRecords.phase, ELIGIBLE),
        isNotNull(episodes.youtube_url),
      ),
    )

  let enqueued = 0
  let skippedNoVideoId = 0
  for (const row of rows) {
    const videoId = extractVideoId(row.youtube_url)
    if (!videoId) {
      skippedNoVideoId++
      continue
    }
    await enqueueJob(
      "youtube.refresh_performance",
      {
        eir_id: row.eir_id,
        episode_id: row.episode_id,
        video_id: videoId,
      },
      { priority: 5, maxAttempts: 3 },
    )
    enqueued++
  }

  console.log(`✅ Scheduled ${enqueued} refresh job(s).`)
  if (skippedNoVideoId > 0) {
    console.log(
      `   skipped ${skippedNoVideoId} episode(s) — could not extract a YouTube video id from the URL.`,
    )
  }
  console.log(`   Worker: run \`npm run worker\` to process them.`)

  process.exit(0)
}

main().catch((e) => {
  console.error("❌ scheduler failed:", e)
  process.exit(1)
})

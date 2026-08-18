/**
 * Freeze every view count we can see, BEFORE YouTube changes what a view is.
 *
 *   npx tsx scripts/snapshot-view-counts.ts
 *
 * WHY, AND WHY IT CANNOT WAIT
 *
 * YouTube emailed on 2026-08-18: from **24 August 2026** a view is counted the
 * moment a video starts playing, with no minimum watch time, for long-form and
 * live as well as Shorts. `statistics.viewCount` in the Data API — the field
 * `lib/youtube/client.ts` reads and `lib/jobs/handlers/youtube-performance.ts`
 * writes into `episodes.view_count` — switches to that method on the same day.
 * The previous metric leaves the public API entirely; it survives only as
 * `engagedViews` in the Analytics/Reporting API, which needs OAuth we do not
 * have (we authenticate with an API key).
 *
 * Two things therefore become unanswerable the moment the date passes:
 *
 *   1. **Was the archive restated, or only future views?** The email says
 *      creators will see an increase in FUTURE views; it does not say whether
 *      historical totals are recomputed. The difference decides whether our
 *      stored series has a step change in it or a change of slope, and no
 *      amount of reading settles it. One snapshot before and one after does.
 *   2. **How big is the discontinuity per episode?** `performance-learning.ts`
 *      computes 7/14/28-day views and velocities from `performance_snapshots`.
 *      A snapshot from 23 Aug compared with one from 25 Aug will show a jump
 *      caused by arithmetic rather than by audience, and nothing downstream
 *      knows the difference.
 *
 * A FILE, NOT A TABLE. This is a fixed reference point, not a moving part of
 * the app: it must still read the same in a year, and it must not depend on
 * a migration or on whatever `episodes.view_count` has been overwritten with
 * since. Committed to the repo for the same reason.
 *
 * It records BOTH numbers — what the API says right now and what our database
 * currently holds — because they can already disagree (the performance handler
 * runs on a schedule) and after the 24th we would not be able to tell which of
 * the two a stale row came from.
 */
import "@/lib/jobs/load-env"
import { writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { db } from "@/lib/db"
import { episodes } from "@/lib/db/schema"
import { getVideosByIds } from "@/lib/youtube/client"

const OUT = join(process.cwd(), "content", "view-count-snapshots")

async function main() {
  if (!db) throw new Error("no database")
  const rows = await db
    .select({ id: episodes.id, slug: episodes.slug, stored: episodes.view_count })
    .from(episodes)
  console.log(`${rows.length} episodes in the database`)

  // The Data API takes 50 ids per call.
  const live = new Map<string, number>()
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50).map((r) => r.id)
    const videos = await getVideosByIds(batch)
    for (const v of videos) live.set(v.id, v.viewCount)
    console.log(`  fetched ${live.size}/${rows.length}`)
  }

  const takenAt = new Date().toISOString()
  const episodesOut = rows.map((r) => ({
    videoId: r.id,
    slug: r.slug,
    storedInDb: r.stored ?? null,
    apiViewCount: live.has(r.id) ? live.get(r.id)! : null,
  }))

  const withApi = episodesOut.filter((e) => e.apiViewCount !== null)
  const total = withApi.reduce((a, e) => a + (e.apiViewCount ?? 0), 0)
  const disagree = withApi.filter((e) => e.apiViewCount !== e.storedInDb)

  const doc = {
    takenAt,
    methodology: "PRE-CHANGE — YouTube's old view counting (minimum watch time). " +
      "From 2026-08-24 a view counts on play start with no minimum.",
    source: "YouTube Data API v3, statistics.viewCount, API key auth",
    episodeCount: rows.length,
    resolvedByApi: withApi.length,
    totalApiViews: total,
    dbDisagreesWithApi: disagree.length,
    episodes: episodesOut,
  }

  mkdirSync(OUT, { recursive: true })
  const file = join(OUT, `${takenAt.slice(0, 10)}-pre-change.json`)
  writeFileSync(file, JSON.stringify(doc, null, 2) + "\n", "utf8")

  console.log(`\nwritten: ${file.replace(process.cwd() + "/", "")}`)
  console.log(`resolved by API: ${withApi.length}/${rows.length}`)
  console.log(`total views (old methodology): ${total.toLocaleString("en-US")}`)
  console.log(`rows where the DB already disagrees with the API: ${disagree.length}`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
